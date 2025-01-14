from rembg import remove, new_session
from PIL import Image
import torch
import sys
from pathlib import Path

def resize_if_needed(image, max_size=256):
    """Уменьшает изображение если оно слишком большое"""
    if max(image.size) > max_size:
        ratio = max_size / max(image.size)
        new_size = tuple(int(dim * ratio) for dim in image.size)
        return image.resize(new_size, Image.Resampling.LANCZOS)
    return image

def remove_bg_optimized(input_path, output_path):
    # Используем GPU если доступно
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    # Создаем сессию с оптимизированными параметрами
    session = new_session(
        "u2net",  # используем u2net - быстрее чем u2net_human_seg
        providers=['CUDAExecutionProvider', 'CPUExecutionProvider'] if device == 'cuda' else ['CPUExecutionProvider'],
    )
    
    # Загружаем изображение
    input_image = resize_if_needed(Image.open(input_path))
    
    # Удаляем фон с оптимизированными настройками
    output_image = remove(
        input_image,
        session=session,
        post_process_mask=False,  # отключаем пост-обработку для скорости
        alpha_matting=False,      # отключаем alpha matting
        alpha_matting_foreground_threshold=0,
        alpha_matting_background_threshold=0,
        alpha_matting_erode_size=0
    )
    
    # Сохраняем результат
    output_image.save(output_path)

def batch_process(input_dir, output_dir):
    """Обработка всех изображений в папке параллельно"""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    
    # Получаем список всех изображений
    image_files = list(input_path.glob('*.jpg')) + list(input_path.glob('*.png'))
    
    # Создаем одну сессию для всех изображений
    session = new_session("u2net")
    
    for img_path in image_files:
        out_path = output_path / f"{img_path.stem}_nobg.png"
        try:
            input_image = Image.open(img_path)
            output_image = remove(
                input_image,
                session=session,
                post_process_mask=False,
                alpha_matting=False
            )
            output_image.save(out_path)
            print(f"Обработано: {img_path.name}")
        except Exception as e:
            print(f"Ошибка при обработке {img_path.name}: {e}")

if __name__ == "__main__":
    if len(sys.argv) == 3:
        # Обработка одного файла
        remove_bg_optimized(sys.argv[1], sys.argv[2])
    elif len(sys.argv) == 4 and sys.argv[1] == '--batch':
        # Пакетная обработка
        batch_process(sys.argv[2], sys.argv[3])
    else:
        print("Использование:")
        print("Для одного файла: python script.py input.jpg output.png")
        print("Для папки: python script.py --batch input_folder output_folder")
