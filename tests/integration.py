"""Real HTTP + SQLite tests. Only temporary databases are modified."""
import concurrent.futures
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

EXE = str(Path(sys.argv.pop(1)).resolve())
ROOT = str(Path(sys.argv.pop(1)).resolve())

class StoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='lamsa-test-')
        cls.db = str(Path(cls.tmp.name) / 'test.sqlite')
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
        cls.url = f'http://127.0.0.1:{port}'
        cls.password = secrets.token_urlsafe(24)
        cls.env = dict(os.environ, LAMSA_DB=cls.db, LAMSA_ROOT=ROOT,
                       LAMSA_PORT=str(port), LAMSA_ORIGIN=cls.url,
                       LAMSA_ADMIN_PASSWORD=cls.password, LAMSA_ADMIN_USER='tester',
                       LAMSA_ALLOW_ORDERS='1', LAMSA_ORDER_LIMIT='200')
        subprocess.run([EXE, '--seed'], env=cls.env, check=True, capture_output=True)
        subprocess.run([EXE, '--create-admin'], env=cls.env, check=True, capture_output=True)
        cls.log = open(Path(cls.tmp.name)/'server.log','w')
        cls.proc = subprocess.Popen([EXE], env=cls.env, stdout=cls.log, stderr=cls.log)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.url+'/api/health',timeout=.2); break
            except (OSError, urllib.error.URLError): time.sleep(.05)
        else: raise RuntimeError('Server never became ready')
        cls.guest = urllib.request.build_opener()
        cls.admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        status, data, _ = cls.request('POST','/api/admin/login',{'username':'tester','password':cls.password},admin=True)
        assert status == 200, data
        cls.csrf = data['csrf']

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=10); cls.log.close(); cls.tmp.cleanup()

    @classmethod
    def request(cls,method,path,data=None,admin=False,headers=None):
        h = {'Content-Type':'application/json'}
        if admin and hasattr(cls,'csrf'): h['X-CSRF-Token']=cls.csrf
        h.update(headers or {})
        payload = json.dumps(data,ensure_ascii=False).encode() if data is not None else None
        req = urllib.request.Request(cls.url+path,data=payload,method=method,headers=h)
        try: response=(cls.admin if admin else cls.guest).open(req,timeout=10)
        except urllib.error.HTTPError as e: response=e
        raw=response.read()
        try: parsed=json.loads(raw)
        except (ValueError, UnicodeDecodeError): parsed=raw
        return response.code, parsed, response.headers

    def setUp(self):
        with sqlite3.connect(self.db) as d:
            d.execute('DELETE FROM order_items'); d.execute('DELETE FROM orders')
            d.execute('UPDATE variants SET stock=10 WHERE active=1')
            settings=json.loads(d.execute('SELECT value FROM settings').fetchone()[0]);settings.update(orders_enabled=True,cod_enabled=True)
            d.execute('UPDATE settings SET value=?',(json.dumps(settings),))
            d.execute('UPDATE shipping_regions SET enabled=0,cod_enabled=0')
            d.execute('UPDATE shipping_regions SET enabled=1,cod_enabled=1,fee=2500 WHERE id=1')

    def order(self,quantity=2,key=None):
        return {'idempotency_key':key or secrets.token_hex(16),'payment_method':'cod',
                'shipping_region_id':1,'items':[{'variant_id':1,'quantity':quantity}],
                'customer':{'name':'عميلة تجربة','phone':'+970 599 123 456','email':'test@example.com',
                            'region':'فلسطين','city':'رام الله','neighborhood':'حي الاختبار',
                            'street':'شارع التجربة','building':'12','details':'الطابق 2','notes':''}}

    def test_01_catalog_product_and_pagination(self):
        s,d,_=self.request('GET','/api/products?limit=5');self.assertEqual(s,200);self.assertEqual(d['total'],24);self.assertEqual(len(d['items']),5)
        p=d['items'][0];self.assertTrue(p['variants']);self.assertEqual(len(p['images']),2)
        s,d,_=self.request('GET',f'/api/products/{p["id"]}');self.assertEqual(d['id'],p['id'])
        self.assertEqual(self.request('GET','/api/products/999999')[0],404)

    def test_02_arabic_search_and_sql_injection(self):
        q=urllib.parse.quote('فستان');s,d,_=self.request('GET','/api/products?q='+q);self.assertEqual(s,200);self.assertEqual(d['total'],3)
        self.assertTrue(all('فستان' in p['name'] for p in d['items']))
        s,d,_=self.request('GET','/api/products?q='+urllib.parse.quote("' OR 1=1 --"));self.assertEqual(s,200);self.assertEqual(d['total'],0)

    def test_03_filters_and_sort(self):
        path='/api/products?category=1&min=10000&max=30000&size=M&color='+urllib.parse.quote('بيج')+'&available=1&sort=price_asc'
        s,d,_=self.request('GET',path);self.assertEqual(s,200);self.assertGreater(d['total'],0)
        self.assertEqual([p['price'] for p in d['items']],sorted(p['price'] for p in d['items']))
        for p in d['items']:
            self.assertEqual(p['category_id'],1);self.assertGreaterEqual(p['price'],10000);self.assertLessEqual(p['price'],30000)
            self.assertTrue(any(v['size']=='M' and v['color']=='بيج' and v['stock']>0 for v in p['variants']))
        for query,field in [('new=1','is_new'),('featured=1','featured'),('sale=1',None)]:
            _,d,_=self.request('GET','/api/products?'+query)
            self.assertTrue(d['items']);self.assertTrue(all(p[field]==1 if field else p['original_price']>p['price'] for p in d['items']))
        self.assertEqual(self.request('GET','/api/products?sort=DROP')[0],400)

    def test_04_cart_prices_shipping_and_missing_variants(self):
        _,p,_=self.request('GET','/api/products/1')
        payload={'items':[{'variant_id':1,'quantity':3,'price':1}],'shipping_region_id':1,'total':1}
        s,q,_=self.request('POST','/api/cart/quote',payload);self.assertEqual(s,200);self.assertEqual(q['subtotal'],3*p['price']);self.assertEqual(q['total'],q['subtotal']+2500)
        payload['items'][0]['variant_id']=999999
        self.assertEqual(self.request('POST','/api/cart/quote',payload)[0],409)

    def test_05_stock_and_quantity_rejection(self):
        with sqlite3.connect(self.db) as d: d.execute('UPDATE variants SET stock=0 WHERE id=1')
        self.assertEqual(self.request('POST','/api/cart/quote',{'items':[{'variant_id':1,'quantity':1}]})[0],409)
        for n in [0,-1,21,1.5]:
            self.assertEqual(self.request('POST','/api/cart/quote',{'items':[{'variant_id':2,'quantity':n}]})[0],400)

    def test_06_real_order_and_idempotency(self):
        order=self.order();s,o,_=self.request('POST','/api/orders',order);self.assertEqual(s,201,o);self.assertTrue(o['number'].startswith('LAM-'))
        s,same,_=self.request('POST','/api/orders',order);self.assertEqual(s,201,same);self.assertEqual(o['number'],same['number'])
        with sqlite3.connect(self.db) as d:
            self.assertEqual(d.execute('SELECT COUNT(*) FROM orders').fetchone()[0],1)
            self.assertEqual(d.execute('SELECT stock FROM variants WHERE id=1').fetchone()[0],8)
            self.assertEqual(json.loads(d.execute('SELECT customer FROM orders').fetchone()[0])['city'],'رام الله')
        order['items'][0]['quantity']=3;self.assertEqual(self.request('POST','/api/orders',order)[0],409)

    def test_07_invalid_customer_delivery_payment(self):
        for key,value in [('phone','bad'),('name',''),('name','   '),('email','bad'),('street','')]:
            o=self.order();o['customer'][key]=value;self.assertEqual(self.request('POST','/api/orders',o)[0],400,key)
        o=self.order();o['shipping_region_id']=2;self.assertEqual(self.request('POST','/api/orders',o)[0],409)
        o=self.order();o['customer']['city']='مدينة أخرى';self.assertEqual(self.request('POST','/api/orders',o)[0],400)
        o=self.order();o['payment_method']='card';self.assertEqual(self.request('POST','/api/orders',o)[0],400)
        with sqlite3.connect(self.db) as d: self.assertEqual(d.execute('SELECT COUNT(*) FROM orders').fetchone()[0],0)

    def test_08_atomic_rejection_and_concurrent_stock(self):
        with sqlite3.connect(self.db) as d:d.execute('UPDATE variants SET stock=1 WHERE id=1')
        o=self.order(1);o['items'].append({'variant_id':999999,'quantity':1})
        self.assertEqual(self.request('POST','/api/orders',o)[0],409)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:self.request('POST','/api/orders',self.order(1))[0],range(2)))
        self.assertEqual(sorted(results),[201,409])
        with sqlite3.connect(self.db) as d:self.assertEqual(d.execute('SELECT stock FROM variants WHERE id=1').fetchone()[0],0)

    def test_09_admin_authorization_csrf_and_headers(self):
        for path in ['overview','products','orders','shipping','settings','session']:
            self.assertEqual(self.request('GET','/api/admin/'+path)[0],401,path)
        self.assertEqual(self.request('PUT','/api/admin/settings',{},admin=True,headers={'X-CSRF-Token':''})[0],403)
        self.assertEqual(self.request('POST','/api/orders',self.order(),headers={'Origin':'https://attacker.test'})[0],403)
        s,_,h=self.request('GET','/api/admin/overview',admin=True);self.assertEqual(s,200);self.assertIn("script-src 'self'",h['Content-Security-Policy']);self.assertEqual(h['Cache-Control'],'no-store')
        self.assertEqual(self.request('POST','/api/admin/login',{'username':'tester','password':'wrong'})[0],401)
        self.assertEqual(self.request('GET','/api/admin/orders/1')[0],401)

    def test_10_status_cancellation_and_sales(self):
        self.assertEqual(self.request('POST','/api/orders',self.order())[0],201)
        _,orders,_=self.request('GET','/api/admin/orders',admin=True);oid=orders[0]['id']
        self.assertEqual(self.request('PUT',f'/api/admin/orders/{oid}/status',{'status':'delivered'},admin=True)[0],409)
        for _ in range(2):self.assertEqual(self.request('PUT',f'/api/admin/orders/{oid}/status',{'status':'cancelled'},admin=True)[0],200)
        with sqlite3.connect(self.db) as d:self.assertEqual(d.execute('SELECT stock FROM variants WHERE id=1').fetchone()[0],10)
        _,stats,_=self.request('GET','/api/admin/overview',admin=True);self.assertEqual(stats['orders']['sales'],0)
        _,merch,_=self.request('GET','/api/merchandising');self.assertFalse(merch['bestsellers_available'])
        self.request('POST','/api/orders',self.order());_,orders,_=self.request('GET','/api/admin/orders',admin=True);oid=orders[0]['id']
        for status in ['preparing','shipped','delivered']:self.assertEqual(self.request('PUT',f'/api/admin/orders/{oid}/status',{'status':status},admin=True)[0],200)
        _,stats,_=self.request('GET','/api/admin/overview',admin=True);self.assertGreater(stats['orders']['sales'],0)
        _,merch,_=self.request('GET','/api/merchandising');self.assertTrue(merch['bestsellers_available'])
        _,best,_=self.request('GET','/api/products?bestsellers=1&sort=bestsellers');self.assertEqual(best['items'][0]['id'],1)
        self.assertEqual(self.request('PUT',f'/api/admin/orders/{oid}/status',{'status':'cancelled'},admin=True)[0],409)

    def test_11_admin_product_crud(self):
        p={'name':'قطعة اختبار','description':'وصف اختبار','category_id':1,'price':15900,'original_price':18900,'featured':True,'is_new':True,'active':True,'images':[], 'variants':[{'size':'M','color':'أزرق','stock':2,'sku':'TEST-ONLY'}]}
        s,saved,_=self.request('POST','/api/admin/products',p,admin=True);self.assertEqual(s,201,saved);pid=saved['id']
        p['price']=14900;self.assertEqual(self.request('PUT',f'/api/admin/products/{pid}',p,admin=True)[0],200)
        self.assertEqual(self.request('DELETE',f'/api/admin/products/{pid}',{},admin=True)[0],200)
        self.assertEqual(self.request('GET',f'/api/products/{pid}')[0],404)
        p['images']=['javascript:alert(1)'];self.assertEqual(self.request('POST','/api/admin/products',p,admin=True)[0],400)

    def test_12_disabled_orders_and_cod(self):
        with sqlite3.connect(self.db) as d:
            settings=json.loads(d.execute('SELECT value FROM settings').fetchone()[0]);settings['orders_enabled']=False;d.execute('UPDATE settings SET value=?',(json.dumps(settings),))
        self.assertEqual(self.request('POST','/api/orders',self.order())[0],409)
        with sqlite3.connect(self.db) as d:
            settings['orders_enabled']=True;d.execute('UPDATE settings SET value=?',(json.dumps(settings),));d.execute('UPDATE shipping_regions SET cod_enabled=0 WHERE id=1')
        self.assertEqual(self.request('POST','/api/orders',self.order())[0],409)

    def test_13_upload_and_settings_validation(self):
        self.assertEqual(self.request('POST','/api/admin/images',{},admin=True)[0],415)
        req=urllib.request.Request(self.url+'/api/admin/images',b'not a PNG',method='POST',headers={'Content-Type':'image/png','X-CSRF-Token':self.csrf})
        try:self.admin.open(req);self.fail('Invalid image accepted')
        except urllib.error.HTTPError as e:self.assertEqual(e.code,400)
        _,s,_=self.request('GET','/api/admin/settings',admin=True);s['whatsapp']='javascript:alert(1)'
        self.assertEqual(self.request('PUT','/api/admin/settings',s,admin=True)[0],400)

    def test_14_empty_catalog_and_persistent_restart(self):
        with sqlite3.connect(self.db) as d:d.execute('UPDATE products SET active=0')
        try:
            s,data,_=self.request('GET','/api/products');self.assertEqual(s,200);self.assertEqual(data['items'],[])
            subprocess.run([EXE,'--init'],env=self.env,check=True,capture_output=True)
            with sqlite3.connect(self.db) as d:self.assertGreater(d.execute('SELECT COUNT(*) FROM products').fetchone()[0],0)
            r=subprocess.run([EXE,'--seed'],env=self.env,capture_output=True);self.assertNotEqual(r.returncode,0)
        finally:
            with sqlite3.connect(self.db) as d:d.execute('UPDATE products SET active=1 WHERE id<=24')

if __name__=='__main__':unittest.main(verbosity=2)
