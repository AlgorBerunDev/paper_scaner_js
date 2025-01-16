from rembg import remove, new_session
from PIL import Image
import numpy as np
import cv2
import sys

def process_a4_document(input_path, output_path):
    # Создаем одну сессию для повторного использования
    session = new_session("u2netp")
    
    # Читаем изображение
    img = Image.open(input_path)
    
    # Оптимальный размер для A4 документов (сохраняя пропорции A4)
    target_width = 1240  # эта ширина обеспечивает хороший баланс между скоростью и качеством для A4
    ratio = target_width / img.size[0]
    target_height = int(img.size[1] * ratio)
    
    # Ресайзим для ускорения обработки
    img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
    
    # Удаляем фон с оптимизированными параметрами для документов
    output = remove(
        img,
        session=session,
        post_process_mask=False,  # отключаем пост-обработку
        alpha_matting=False,      # отключаем alpha matting для скорости
        only_mask=False           # нам нужно полное изображение, не только маска
    )
    
    # Сохраняем результат
    output.save(output_path)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Использование: python script.py input.jpg output.png")
        sys.exit(1)
        
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        process_a4_document(input_path, output_path)
        print(f"Готово! Результат сохранен в {output_path}")
    except Exception as e:
        print(f"Ошибка: {e}")
