import cv2
import os
import time
import uuid
from pathlib import Path
from typing import Optional, Tuple, Union


class CameraCapture:
    def __init__(self, camera_id: int = 0, temp_dir: Union[str, Path] = "temp_files"):
        """Initialize camera capture functionality.
        
        Args:
            camera_id: The ID of the camera to use (usually 0 for built-in webcam)
            temp_dir: Directory to save captured images
        """
        self.camera_id = camera_id
        self.temp_dir = Path(temp_dir)
        
        # Ensure temp directory exists
        if not self.temp_dir.exists():
            self.temp_dir.mkdir(parents=True, exist_ok=True)
            print(f"Created directory: {self.temp_dir}")
    
    def capture_image(self) -> Optional[Tuple[str, str]]:
        """Capture an image from the camera.
        
        Returns:
            Tuple containing (file_path, filename) if successful, None otherwise
        """
        cap = None
        try:
            # Initialize camera
            cap = cv2.VideoCapture(self.camera_id)
            
            if not cap.isOpened():
                print(f"Error: Could not open camera {self.camera_id}")
                return None
            
            # Set camera properties for better image quality
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            cap.set(cv2.CAP_PROP_FPS, 30)
            
            # Allow camera to warm up
            time.sleep(0.5)
            
            # Try to capture a few frames to ensure we get a good one
            for attempt in range(3):
                ret, frame = cap.read()
                if ret and frame is not None:
                    break
                time.sleep(0.1)
            
            if not ret or frame is None:
                print("Error: Could not read frame from camera")
                return None
            
            # Generate unique filename
            filename = f"camera_{uuid.uuid4()}.jpg"
            file_path = str(self.temp_dir / filename)
            
            # Save the captured frame with high quality
            success = cv2.imwrite(file_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            
            if not success:
                print("Error: Could not save captured image")
                return None
            
            print(f"Image captured and saved to: {file_path}")
            return file_path, filename
        
        except Exception as e:
            print(f"Error during image capture: {e}")
            return None
        
        finally:
            # Always release the camera
            if cap is not None:
                cap.release()
    
    def preview_camera(self, window_name: str = "Camera Preview", exit_key: str = 'q', capture_key: str = 'c') -> Optional[Tuple[str, str]]:
        """Open a preview window for the camera with option to capture.
        
        Args:
            window_name: Name of the preview window
            exit_key: Key to press to exit the preview
            capture_key: Key to press to capture an image
            
        Returns:
            Tuple containing (file_path, filename) if image was captured, None otherwise
        """
        try:
            cap = cv2.VideoCapture(self.camera_id)
            
            if not cap.isOpened():
                print(f"Error: Could not open camera {self.camera_id}")
                return None
            
            print(f"Camera preview started. Press '{capture_key}' to capture an image or '{exit_key}' to exit.")
            
            captured_path = None
            captured_filename = None
            
            while True:
                ret, frame = cap.read()
                
                if not ret:
                    print("Error: Could not read frame from camera")
                    break
                
                # Display the frame
                cv2.imshow(window_name, frame)
                
                # Check for key presses (wait 1ms)
                key = cv2.waitKey(1) & 0xFF
                
                # Check if exit key was pressed
                if key == ord(exit_key):
                    print("Exiting camera preview...")
                    break
                
                # Check if capture key was pressed
                if key == ord(capture_key):
                    # Generate unique filename
                    filename = f"camera_{uuid.uuid4()}.jpg"
                    file_path = str(self.temp_dir / filename)
                    
                    # Save the current frame
                    cv2.imwrite(file_path, frame)
                    print(f"Image captured and saved to: {file_path}")
                    
                    captured_path = file_path
                    captured_filename = filename
                    break
            
            # Release resources
            cap.release()
            cv2.destroyAllWindows()
            
            return (captured_path, captured_filename) if captured_path else None
            
        except Exception as e:
            print(f"Error during camera preview: {e}")
            return None


# Test functionality if run directly
if __name__ == "__main__":
    camera = CameraCapture()
    
    # Test method 1: Simple capture
    print("Testing direct capture...")
    result = camera.capture_image()
    if result:
        print(f"Capture successful: {result}")
    
    # Test method 2: Preview with capture
    print("\nTesting camera preview with capture...")
    print("Press 'c' to capture an image or 'q' to quit")
    result = camera.preview_camera()
    if result:
        print(f"Preview capture successful: {result}")
