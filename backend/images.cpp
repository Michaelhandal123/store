#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_MAX_DIMENSIONS 4096
#include <stb_image.h>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>
#include <stdexcept>
#include <string>
std::string normalize_image(const std::string &body) {
    int w, h, c;
    const auto *p = reinterpret_cast<const unsigned char *>(body.data());
    if (body.size() > 5 * 1024 * 1024 || !stbi_info_from_memory(p, int(body.size()), &w, &h, &c) ||
        w < 1 || h < 1 || w > 4096 || h > 4096 || int64_t(w) * h > 12000000)
        throw std::runtime_error("Invalid image dimensions");
    auto *pixels = stbi_load_from_memory(p, int(body.size()), &w, &h, &c, 4);
    if (!pixels)
        throw std::runtime_error("Invalid image");
    std::string output;
    int ok = stbi_write_png_to_func(
        [](void *ctx, void *data, int n) {
            static_cast<std::string *>(ctx)->append(static_cast<char *>(data), n);
        },
        &output, w, h, 4, pixels, w * 4);
    stbi_image_free(pixels);
    if (!ok)
        throw std::runtime_error("Image conversion failed");
    return output;
}
