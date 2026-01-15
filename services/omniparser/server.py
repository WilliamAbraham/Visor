# temporary publish server with:
# cloudflared tunnel --url http://127.0.0.1:7777


from fastapi import FastAPI, Body
from typing import Optional
from PIL import Image
import io
import base64, os, time
from util.utils import check_ocr_box, get_yolo_model, get_caption_model_processor, get_som_labeled_img
import torch

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Get project root directory (3 levels up from this file: services/omniparser/server.py -> services/omniparser -> services -> root)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

yolo_model = get_yolo_model(model_path=os.path.join(PROJECT_ROOT, 'weights', 'icon_detect', 'model.pt'))
yolo_model = yolo_model.to(str(DEVICE))
caption_model_processor = get_caption_model_processor(model_name="florence2", model_name_or_path=os.path.join(PROJECT_ROOT, 'weights', 'icon_caption_florence'), device=str(DEVICE))
# caption_model_processor = get_caption_model_processor(model_name="blip2", model_name_or_path="weights/icon_caption_blip2")

HOST = "127.0.0.1"
PORT = 7777

app = FastAPI()

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "labeled_screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.get("/hello")
async def hello(name : str):
    return {"message": f"Hello, {name}!"}

@app.post("/omni")
async def parse_screenshot(image_base64: str = Body(...)):
    try:
        # Decode base64 image
        image_data = base64.b64decode(image_base64)
        input_image = Image.open(io.BytesIO(image_data))
        
        # Use hardcoded settings
        box_threshold = 0.05
        iou_threshold = 0.1
        use_paddleocr = False
        imgsz = 640
        
        image, parsed_content_list = process(input_image, box_threshold, iou_threshold, use_paddleocr, imgsz)

        # Save output with timestamp
        output_filename = f"labeled_{int(time.time())}.png"
        output_filepath = os.path.join(OUTPUT_DIR, output_filename)
        image.save(output_filepath)

        # Convert image to base64
        img_buffer = io.BytesIO()
        image.save(img_buffer, format='PNG')
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')

        return {"success": True, "parsed_content": parsed_content_list, "image_base64": img_base64}
    except Exception as e:
        print(f"Error processing image: {e}")
        return {"success": False, "error": str(e)}

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
    return image, parsed_content_list

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)