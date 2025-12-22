from fastapi import FastAPI
from typing import Optional
from PIL import Image
import io
import base64, os
from util.utils import check_ocr_box, get_yolo_model, get_caption_model_processor, get_som_labeled_img
import torch

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
yolo_model = get_yolo_model(model_path='weights/icon_detect/model.pt')
yolo_model = yolo_model.to(str(DEVICE))
caption_model_processor = get_caption_model_processor(model_name="florence2", model_name_or_path="weights/icon_caption_florence", device=str(DEVICE))
# caption_model_processor = get_caption_model_processor(model_name="blip2", model_name_or_path="weights/icon_caption_blip2")

HOST = "127.0.0.1"
PORT = 7777

app = FastAPI()

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "labeled_screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.get("/omni")
async def parse_screenshot(filepath: str):
    input_image = Image.open(filepath)
    box_threshold = 0.05
    iou_threshold = 0.1
    use_paddleocr = False
    imgsz = 640
    image, parsed_content_list = process(input_image, box_threshold, iou_threshold, use_paddleocr, imgsz)

    output_filepath = os.path.join(OUTPUT_DIR, os.path.basename(filepath))
    image.save(output_filepath)

    return parsed_content_list

def process(
    image_input,
    box_threshold,
    iou_threshold,
    use_paddleocr,
    imgsz
) -> Optional[Image.Image]:

    print('processing screenshot')
    box_overlay_ratio = image_input.size[0] / 3200
    draw_bbox_config = {
        'text_scale': 0.8 * box_overlay_ratio,
        'text_thickness': max(int(2 * box_overlay_ratio), 1),
        'text_padding': max(int(3 * box_overlay_ratio), 1),
        'thickness': max(int(3 * box_overlay_ratio), 1),
    }

    ocr_bbox_rslt, is_goal_filtered = check_ocr_box(
        image_input, 
        display_img = False, 
        output_bb_format='xyxy', 
        goal_filtering=None, 
        easyocr_args={'paragraph': False, 'text_threshold':0.5}, 
        use_paddleocr=use_paddleocr
    )
    text, ocr_bbox = ocr_bbox_rslt
    dino_labled_img, label_coordinates, parsed_content_list = get_som_labeled_img(image_input, yolo_model, BOX_TRESHOLD = box_threshold, output_coord_in_ratio=True, ocr_bbox=ocr_bbox,draw_bbox_config=draw_bbox_config, caption_model_processor=caption_model_processor, ocr_text=text,iou_threshold=iou_threshold, imgsz=imgsz,)  
    image = Image.open(io.BytesIO(base64.b64decode(dino_labled_img)))
    print('finish processing')
    parsed_content_list = '\n'.join([f'icon {i}: ' + str(v) for i,v in enumerate(parsed_content_list)])
    return image, str(parsed_content_list)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)