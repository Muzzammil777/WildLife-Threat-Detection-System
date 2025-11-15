import os
import shutil
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Union, Any, Set

from ultralytics import YOLO

class YOLOPredictor:
    # Define classes that are considered threats
    THREAT_CLASSES: Set[str] = {
        'person', 'car', 'motorcycle', 'truck', 'boat', 'fire', 'smoke',
        'gun', 'knife', 'axe', 'chainsaw'
    }
    
    # Define threat confidence threshold
    THREAT_THRESHOLD: float = 0.45
    
    def __init__(self, model_name: str = "yolov8n.pt"):
        """Initialize the YOLO predictor with a specified model.
        
        Args:
            model_name: Name or path to the YOLO model
        """
        self.model = YOLO(model_name)
        self.logger = logging.getLogger(__name__)
    def predict(self, image_path: Union[str, Path]) -> List[Dict[str, Any]]:
        """Perform prediction on an image and extract relevant information.
        
        Args:
            image_path: Path to the image file
            
        Returns:
            List of dictionaries containing detection information including threat assessment
        """
        # Run inference
        results = self.model(image_path)
        
        # Process results
        detections = []
        
        # Loop through results (typically just one for single image)
        for result in results:
            boxes = result.boxes
            for i, box in enumerate(boxes):
                # Get class information
                cls_id = int(box.cls[0].item())
                cls_name = result.names[cls_id]
                confidence = float(box.conf[0].item())
                
                # Get bounding box (convert to Python list for JSON serialization)
                bbox = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                
                # Determine if this is a potential threat
                is_threat = (
                    cls_name in self.THREAT_CLASSES and 
                    confidence >= self.THREAT_THRESHOLD
                )
                
                # Log threats
                if is_threat:
                    self.logger.warning(f"Potential threat detected: {cls_name} with {confidence:.2f} confidence")
                
                # Format detection information
                detection = {
                    "class_name": cls_name,
                    "confidence": round(confidence, 3),
                    "is_threat": is_threat,
                    "bounding_box": {
                        "x1": round(bbox[0], 2),
                        "y1": round(bbox[1], 2),
                        "x2": round(bbox[2], 2),
                        "y2": round(bbox[3], 2)
                    }
                }
                detections.append(detection)
        
        return detections
    
    @staticmethod
    def cleanup_file(file_path: Union[str, Path]) -> None:
        """Remove the file after prediction.
        
        Args:
            file_path: Path to the file that needs to be deleted
        """
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"Deleted temporary file: {file_path}")


# For testing purposes
if __name__ == "__main__":
    predictor = YOLOPredictor()
    
    # Test with a sample image
    test_image = "path_to_your_test_image.jpg"
    if os.path.exists(test_image):
        results = predictor.predict(test_image)
        print(f"Detection results: {results}")
    else:
        print(f"Test image not found: {test_image}")
