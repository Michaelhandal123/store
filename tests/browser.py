"""Browser flow against an isolated temporary store. Requires Playwright + Chromium.
Usage: python tests/browser.py build/lamsa .
Set CHROMIUM_PATH if the system browser isn't /usr/bin/chromium.
"""
import base64
import os
from pathlib import Path
import json
import sqlite3
from playwright.sync_api import sync_playwright, expect
from integration import StoreTests, ROOT

StoreTests.setUpClass()
fixture=StoreTests()
fixture.setUp()
outputs=Path(ROOT)/'test-results'
outputs.mkdir(exist_ok=True)
errors=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(StoreTests.url)
        expect(page.locator('#new-products .product-card')).to_have_count(4)
        expect(page.locator('html')).to_have_attribute('dir','rtl')
        page.screenshot(path=str(outputs/'home-desktop.png'),full_page=True)
        for width in [360,390,768,1440]:
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'Homepage overflow at {width}'
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#menu').click()
        expect(page.locator('#main-nav')).to_be_visible()
        page.screenshot(path=str(outputs/'home-mobile.png'),full_page=True)
        page.goto(StoreTests.url+'/products.html')
        expect(page.locator('#catalog .product-card')).to_have_count(12)
        page.locator('#filters [name=q]').fill('فستان')
        page.get_by_role('button',name='عرض النتائج').click()
        expect(page.locator('#catalog .product-card')).to_have_count(3)
        page.locator('#catalog .product-card .wish').first.click()
        page.goto(StoreTests.url+'/wishlist.html')
        expect(page.locator('#wishlist-products .product-card')).to_have_count(1)
        page.goto(StoreTests.url+'/product.html?id=1')
        expect(page.locator('#add-cart')).to_be_disabled()
        page.locator('[data-size=M]').click()
        page.locator('[data-color="بيج"]').click()
        expect(page.locator('#add-cart')).to_be_enabled()
        page.locator('#enlarge').click()
        expect(page.locator('#image-modal')).to_be_visible()
        page.keyboard.press('Escape')
        page.locator('#add-cart').click()
        expect(page.locator('#cart-count')).to_have_text('1')
        page.reload()
        expect(page.locator('#cart-count')).to_have_text('1')
        page.goto(StoreTests.url+'/cart.html')
        expect(page.locator('.cart-line')).to_have_count(1)
        page.locator('[data-qty]').fill('2');page.locator('[data-qty]').press('Tab')
        expect(page.locator('#cart-count')).to_have_text('2')
        expect(page.locator('[data-qty]')).to_have_value('2')
        page.goto(StoreTests.url+'/checkout.html')
        for key,value in {'name':'عميلة اختبار المتصفح','phone':'+972 50 123 4567','email':'browser@example.com','neighborhood':'حي الاختبار','street':'شارع الاختبار','building':'7','details':'الطابق الأول','notes':'طلب اختبار آلي'}.items():
            page.locator(f'#checkout-form [name={key}]').fill(value)
        page.locator('#checkout-region').select_option('1')
        page.locator('#checkout-form [type=checkbox]').check()
        
        try: expect(page.locator('#place-order')).to_be_enabled()
        except Exception:
            print('CHECKOUT DIAGNOSTICS:',page.locator('#checkout-message').inner_text(), page.locator('#checkout-summary').inner_text(), page.locator('#checkout-region').input_value(),page.evaluate("localStorage.getItem('lamsa-cart')"), errors)
            raise
        page.locator('#place-order').click()
        expect(page).to_have_url(StoreTests.url+'/order-confirmation.html')
        expect(page.locator('#confirmation')).to_contain_text('تم استلام طلبكِ')
        expect(page.locator('#cart-count')).to_have_text('0')
        with sqlite3.connect(StoreTests.db) as d:
            assert d.execute('SELECT COUNT(*) FROM orders').fetchone()[0]==1
        page.goto(StoreTests.url+'/admin/')
        page.locator('#login [name=username]').fill('tester')
        page.locator('#login [name=password]').fill(StoreTests.password)
        page.locator('#login button').click()
        expect(page.locator('#admin-area')).to_be_visible()
        page.locator('[data-tab=products]').click()
        page.locator('#new-product').click()
        page.locator('[name=name]').fill('منتج اختبار المتصفح')
        page.locator('[name=description]').fill('وصف عينة لاختبار لوحة الإدارة')
        page.locator('[data-v=sku]').fill('BROWSER-TEST-01')
        page.locator('[data-v=stock]').fill('4')
        page.locator('#image-upload').set_input_files({'name':'pixel.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')})
        expect(page.locator('#upload-status')).to_have_text('تم رفع الصورة')
        page.locator('#save-product').click()
        expect(page.locator('tbody')).to_contain_text('منتج اختبار المتصفح')
        page.locator('[data-tab=orders]').click()
        page.locator('[data-order]').first.click()
        expect(page.locator('#admin-content')).to_contain_text('عميلة اختبار المتصفح')
        page.locator('[data-tab=shipping]').click()
        expect(page.locator('[data-region]')).to_have_count(18)
        page.locator('[data-tab=settings]').click()
        expect(page.locator('[name=name]')).to_have_value('لمسة | LAMSA')
        page.locator('#logout').click()
        expect(page.locator('#admin-login')).to_be_visible()
        # Public pages fit tablet and mobile widths without horizontal scrolling.
        for route in ['/products.html','/product.html?id=1','/cart.html','/checkout.html','/admin/']:
            page.goto(StoreTests.url+route)
            page.wait_for_load_state('networkidle')
            for width in [360,768]:
                page.set_viewport_size({'width':width,'height':900})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'Overflow {route}: {width}'
        # Missing image fallback and empty catalog are real states.
        with sqlite3.connect(StoreTests.db) as d:
            d.execute("UPDATE product_images SET path='/assets/missing.svg' WHERE product_id=1")
        page.goto(StoreTests.url+'/product.html?id=1')
        expect(page.locator('#main-image')).to_have_attribute('src','/assets/placeholder.svg')
        with sqlite3.connect(StoreTests.db) as d:d.execute('UPDATE products SET active=0')
        page.goto(StoreTests.url+'/products.html')
        expect(page.locator('#catalog .empty')).to_be_visible()
        assert not errors,errors
        browser.close()
    print('PASS: browser shopping, real checkout, admin CRUD/upload, RTL, mobile/tablet layout, missing images and empty catalog. No JavaScript errors.')
finally:
    StoreTests.tearDownClass()
