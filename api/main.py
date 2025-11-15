import os
import uuid
import logging
from typing import Dict, List, Union, Optional
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Configure logging before other imports
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('wildlife_threat_api.log')
    ]
)
logger = logging.getLogger(__name__)

# Import our prediction models
from image_model.yolo_predict import YOLOPredictor
from audio_model.yamnet_predict import YAMNetPredictor
from image_model.camera_capture import CameraCapture

# Import utility modules
from utils import database, notifications, geolocation

# Create FastAPI app
app = FastAPI(
    title="Wildlife Threat Detection System",
    description="API for detecting threats to wildlife using image and sound analysis",
    version="1.0.0"
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging middleware to track request/response details
@app.middleware("http")
async def log_requests(request, call_next):
    import logging
    import time
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("api")
    
    start_time = time.time()
    
    # Log request details
    logger.info(f"Request: {request.method} {request.url.path}")
    logger.info(f"Headers: {request.headers}")
    
    # Process the request
    response = await call_next(request)
    
    # Log response details
    process_time = time.time() - start_time
    logger.info(f"Response status: {response.status_code}")
    logger.info(f"Process time: {process_time:.4f} seconds")
    
    return response

# Initialize predictors
logger.info("Initializing YOLO predictor...")
yolo_predictor = YOLOPredictor()
logger.info("Initializing YAMNet predictor...")
yamnet_predictor = YAMNetPredictor()

# Initialize camera with error handling
logger.info("Initializing camera capture...")
try:
    camera = CameraCapture()
    # Test camera availability at startup
    import cv2
    test_cap = cv2.VideoCapture(0)
    if test_cap.isOpened():
        logger.info("Camera successfully initialized and available")
        test_cap.release()
    else:
        logger.warning("Camera initialization completed but camera not accessible")
except Exception as e:
    logger.error(f"Failed to initialize camera: {str(e)}")
    camera = None

# Define temp directory
TEMP_DIR = Path("temp_files")

# Ensure temp directory exists
if not TEMP_DIR.exists():
    TEMP_DIR.mkdir(exist_ok=True)
    print(f"Created temporary directory: {TEMP_DIR}")


# Define response models
class LocationData(BaseModel):
    latitude: float
    longitude: float
    description: Optional[str] = None

class DetectionResponse(BaseModel):
    success: bool
    message: str
    detections: List[Dict]
    threat_id: Optional[str] = None
    location: Optional[LocationData] = None
    notification_sent: Optional[bool] = None

class RangerResponse(BaseModel):
    threat_id: str
    ranger_name: str
    action_taken: str
    response_details: str
    evidence_photos: Optional[List[str]] = None
    response_date: Optional[str] = None


@app.post("/analyze-image/", response_model=DetectionResponse)
async def analyze_image(
    file: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    notify: bool = Form(False)
):
    """
    Endpoint to analyze an uploaded image for threats using YOLOv8.
    If threats are detected and notify=True, sends an alert to the forest ranger.
    """
    # Log request information for debugging
    logger = logging.getLogger("api.analyze_image")
    logger.info(f"Received image upload: {file.filename}")
    logger.info(f"Content-Type: {file.content_type}")
    logger.info(f"Location: lat={latitude}, lon={longitude}, notify={notify}")
    
    # Check file content type with more flexibility
    allowed_types = ["image/jpeg", "image/png", "image/jpg"]
    content_type = file.content_type.lower() if file.content_type else ""
    
    if not any(allowed_type in content_type for allowed_type in allowed_types):
        logger.warning(f"Unsupported content type: {content_type}")
        raise HTTPException(status_code=400, detail="Unsupported image format. Please upload JPEG or PNG.")
    
    # Generate a unique filename to avoid conflicts
    temp_path = TEMP_DIR / f"{uuid.uuid4()}_{file.filename}"
    
    try:
        # Save the uploaded file temporarily
        with open(temp_path, "wb") as temp_file:
            content = await file.read()
            temp_file.write(content)
        
        # Perform prediction
        results = yolo_predictor.predict(str(temp_path))
        
        # Get location if not provided
        if latitude is None or longitude is None:
            latitude, longitude = geolocation.get_current_location()
        
        # Get location description
        location_desc = geolocation.get_location_description(latitude, longitude)
        
        # Determine if there's a threat
        threat_detected = any(detection.get("is_threat", False) for detection in results)
        threat_type = "unknown"
        max_confidence = 0.0
        
        # Find the most significant threat and its confidence
        for detection in results:
            if detection.get("is_threat", False) and detection.get("confidence", 0) > max_confidence:
                max_confidence = detection.get("confidence", 0)
                threat_type = detection.get("class_name", "unknown")
        
        # Store results in database
        threat_id = None
        notification_sent = False
        
        if results:
            # If detections are found, store them
            threat_id = database.store_threat_detection(
                threat_type=threat_type if threat_detected else "none",
                confidence=max_confidence,
                source_type="image",
                detections=results,
                latitude=latitude,
                longitude=longitude,
                file_path=str(temp_path) if threat_detected else None,  # Only save path if threat detected
                metadata={"filename": file.filename, "location_desc": location_desc}
            )
            
            # Send notification if requested and a threat is detected
            if notify and threat_detected:
                notification_sent = notifications.send_threat_alert(
                    threat_type=threat_type,
                    confidence=max_confidence,
                    location_desc=location_desc,
                    latitude=latitude,
                    longitude=longitude
                )
                
                if notification_sent and threat_id:
                    # Update the database to mark as notified
                    database.mark_as_notified(threat_id)
        
        # Clean up the temporary file if no threat or already stored
        if not threat_detected or threat_id:
            yolo_predictor.cleanup_file(temp_path)
        
        # Return results with location and notification info
        return {
            "success": True,
            "message": f"Successfully analyzed image: {file.filename}" + 
                      (f" - THREAT DETECTED: {threat_type.upper()}" if threat_detected else ""),
            "detections": results,
            "threat_id": threat_id,
            "location": {
                "latitude": latitude,
                "longitude": longitude,
                "description": location_desc
            } if latitude and longitude else None,
            "notification_sent": notification_sent if notify else None
        }
    
    except Exception as e:
        # Ensure file cleanup even if there's an error
        if temp_path.exists():
            os.remove(temp_path)
        
        # Return error information
        logger.error(f"Error processing image: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@app.post("/analyze-audio/", response_model=DetectionResponse)
async def analyze_audio(
    file: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    notify: bool = Form(False),
    source: str = Form(None)  # New parameter to identify if from microphone or upload
):
    """
    Endpoint to analyze an uploaded audio file for threats using YAMNet.
    If threats are detected and notify=True, sends an alert to the forest ranger.
    
    The 'source' parameter can be used to distinguish between uploaded files and
    microphone recordings, which may require different processing.
    """
    # Log request information for debugging
    logger = logging.getLogger("api.analyze_audio")
    logger.info(f"Received audio upload: {file.filename}")
    logger.info(f"Content-Type: {file.content_type}")
    logger.info(f"Location: lat={latitude}, lon={longitude}, notify={notify}")
    logger.info(f"Source: {source}")
    
    # Accept both WAV and MP3 files
    allowed_types = ["audio/wav", "audio/x-wav", "audio/mp3", "audio/mpeg"]
    content_type = file.content_type.lower() if file.content_type else ""

    # Special handling for microphone recordings which might have different content types
    is_microphone = source == "microphone"

    if not is_microphone and not any(allowed_type in content_type for allowed_type in allowed_types):
        logger.warning(f"Unsupported content type: {content_type}")
        raise HTTPException(status_code=400, detail="Unsupported audio format. Please upload WAV or MP3 files only.")

    # Generate a unique filename to avoid conflicts
    temp_path = TEMP_DIR / f"{uuid.uuid4()}_{file.filename}"

    # If MP3, convert to WAV for YAMNet
    is_mp3 = "mp3" in content_type or file.filename.lower().endswith(".mp3")
    wav_path = temp_path
    if is_mp3:
        from pydub import AudioSegment
        wav_path = TEMP_DIR / f"{uuid.uuid4()}_converted.wav"
    
    try:

        # Save the uploaded file temporarily
        content = await file.read()
        with open(temp_path, "wb") as temp_file:
            temp_file.write(content)

        # If MP3, convert to WAV (read into memory to avoid file lock)
        if is_mp3:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(temp_path, format="mp3")
            audio = audio.set_channels(1).set_frame_rate(16000)
            audio.export(wav_path, format="wav")
            # Now safe to delete the MP3 temp file
            if temp_path.exists():
                os.remove(temp_path)

        # Perform prediction on the correct file
        results = yamnet_predictor.predict(str(wav_path))

        # Get location if not provided
        if latitude is None or longitude is None:
            latitude, longitude = geolocation.get_current_location()

        # Get location description
        location_desc = geolocation.get_location_description(latitude, longitude)

        # Determine if there's a threat
        threat_detected = any(detection.get("is_threat", False) for detection in results)
        threat_type = "unknown"
        max_confidence = 0.0

        # Find the most significant threat and its confidence
        for detection in results:
            if detection.get("is_threat", False) and detection.get("confidence", 0) > max_confidence:
                max_confidence = detection.get("confidence", 0)
                threat_type = detection.get("class_name", "unknown")

        # Store results in database
        threat_id = None
        notification_sent = False

        if results:
            # If detections are found, store them
            threat_id = database.store_threat_detection(
                threat_type=threat_type if threat_detected else "none",
                confidence=max_confidence,
                source_type="audio",
                detections=results,
                latitude=latitude,
                longitude=longitude,
                file_path=str(wav_path) if threat_detected else None,  # Only save path if threat detected
                metadata={"filename": file.filename, "location_desc": location_desc}
            )

            # Send notification if requested and a threat is detected
            if notify and threat_detected:
                notification_sent = notifications.send_threat_alert(
                    threat_type=threat_type,
                    confidence=max_confidence,
                    location_desc=location_desc,
                    latitude=latitude,
                    longitude=longitude
                )

                if notification_sent and threat_id:
                    # Update the database to mark as notified
                    database.mark_as_notified(threat_id)

        # Clean up the temporary files if no threat or already stored
        if not threat_detected or threat_id:
            yamnet_predictor.cleanup_file(temp_path)
            if is_mp3 and wav_path.exists():
                yamnet_predictor.cleanup_file(wav_path)

        # Return results with location and notification info
        return {
            "success": True,
            "message": f"Successfully analyzed audio: {file.filename}" + 
                      (f" - THREAT DETECTED: {threat_type.upper()}" if threat_detected else ""),
            "detections": results,
            "threat_id": threat_id,
            "location": {
                "latitude": latitude,
                "longitude": longitude,
                "description": location_desc
            } if latitude and longitude else None,
            "notification_sent": notification_sent if notify else None
        }

    except Exception as e:
        # Ensure file cleanup even if there's an error
        if temp_path.exists():
            os.remove(temp_path)
        if is_mp3 and wav_path.exists():
            os.remove(wav_path)

        # Return error information
        logger.error(f"Error processing audio: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")


@app.post("/capture-and-analyze/", response_model=DetectionResponse)
async def capture_and_analyze(
    background_tasks: BackgroundTasks,
    latitude: Optional[float] = Query(None),
    longitude: Optional[float] = Query(None),
    notify: bool = Query(False)
):
    """
    Endpoint to capture an image from the camera and analyze it using YOLOv8.
    If threats are detected and notify=True, sends an alert to the forest ranger.
    """
    logger = logging.getLogger("api.capture_and_analyze")
    logger.info(f"Capture and analyze request received")
    logger.info(f"Location: lat={latitude}, lon={longitude}, notify={notify}")
    
    # Check if camera is available
    if camera is None:
        logger.error("Camera not initialized")
        raise HTTPException(status_code=500, detail="Camera not available. Please check camera connection.")
    
    try:
        # Capture image from camera
        logger.info("Attempting to capture image from camera...")
        result = camera.capture_image()
        
        if not result:
            logger.error("Camera capture failed - no result returned")
            raise HTTPException(status_code=500, detail="Failed to capture image from camera. Please check camera connection and permissions.")
            
        file_path, filename = result
        logger.info(f"Image captured successfully: {filename} at {file_path}")
        
        # Perform prediction
        results = yolo_predictor.predict(file_path)
        
        # Get location if not provided
        if latitude is None or longitude is None:
            latitude, longitude = geolocation.get_current_location()
            
        # Get location description
        location_desc = geolocation.get_location_description(latitude, longitude)
        
        # Determine if there's a threat
        threat_detected = any(detection.get("is_threat", False) for detection in results)
        threat_type = "unknown"
        max_confidence = 0.0
        
        # Find the most significant threat and its confidence
        for detection in results:
            if detection.get("is_threat", False) and detection.get("confidence", 0) > max_confidence:
                max_confidence = detection.get("confidence", 0)
                threat_type = detection.get("class_name", "unknown")
        
        # Store results in database
        threat_id = None
        notification_sent = False
        
        if results:
            # If detections are found, store them
            threat_id = database.store_threat_detection(
                threat_type=threat_type if threat_detected else "none",
                confidence=max_confidence,
                source_type="camera",
                detections=results,
                latitude=latitude,
                longitude=longitude,
                file_path=file_path if threat_detected else None,  # Only save path if threat detected
                metadata={"filename": filename, "location_desc": location_desc}
            )
            
            # Send notification if requested and a threat is detected
            if notify and threat_detected:
                notification_sent = notifications.send_threat_alert(
                    threat_type=threat_type,
                    confidence=max_confidence,
                    location_desc=location_desc,
                    latitude=latitude,
                    longitude=longitude
                )
                
                if notification_sent and threat_id:
                    # Update the database to mark as notified
                    database.mark_as_notified(threat_id)
        
        # Clean up the file in the background if no threat (otherwise keep for evidence)
        if not threat_detected or not threat_id:
            background_tasks.add_task(os.remove, file_path)
        
        # Return results with location and notification info
        return {
            "success": True,
            "message": f"Successfully captured and analyzed image from camera" + 
                      (f" - THREAT DETECTED: {threat_type.upper()}" if threat_detected else ""),
            "detections": results,
            "threat_id": threat_id,
            "location": {
                "latitude": latitude,
                "longitude": longitude,
                "description": location_desc
            } if latitude and longitude else None,
            "notification_sent": notification_sent if notify else None
        }
    
    except Exception as e:
        # Return error information
        logger.error(f"Error processing camera image: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing camera image: {str(e)}")


@app.post("/manual-capture/", response_model=DetectionResponse)
async def manual_capture(
    background_tasks: BackgroundTasks,
    latitude: Optional[float] = Query(None),
    longitude: Optional[float] = Query(None),
    notify: bool = Query(False)
):
    """
    Endpoint to manually trigger a camera capture and analyze it using YOLOv8.
    If threats are detected and notify=True, sends an alert to the forest ranger.
    """
    logger = logging.getLogger("api.manual_capture")
    logger.info(f"Manual capture request received")
    logger.info(f"Location: lat={latitude}, lon={longitude}, notify={notify}")
    
    # Check if camera is available
    if camera is None:
        logger.error("Camera not initialized")
        raise HTTPException(status_code=500, detail="Camera not available. Please check camera connection.")
    
    try:
        # Capture image from camera
        logger.info("Attempting manual camera capture...")
        result = camera.capture_image()
        
        if not result:
            logger.error("Manual camera capture failed - no result returned")
            raise HTTPException(status_code=500, detail="Failed to capture image from camera. Please check camera connection and permissions.")
            
        file_path, filename = result
        logger.info(f"Manual capture successful: {filename} at {file_path}")
        
        # Perform prediction
        results = yolo_predictor.predict(file_path)
        
        # Get location if not provided
        if latitude is None or longitude is None:
            latitude, longitude = geolocation.get_current_location()
            
        # Get location description
        location_desc = geolocation.get_location_description(latitude, longitude)
        
        # Determine if there's a threat
        threat_detected = any(detection.get("is_threat", False) for detection in results)
        threat_type = "unknown"
        max_confidence = 0.0
        
        # Find the most significant threat and its confidence
        for detection in results:
            if detection.get("is_threat", False) and detection.get("confidence", 0) > max_confidence:
                max_confidence = detection.get("confidence", 0)
                threat_type = detection.get("class_name", "unknown")
        
        # Store results in database
        threat_id = None
        notification_sent = False
        
        if results:
            # If detections are found, store them
            threat_id = database.store_threat_detection(
                threat_type=threat_type if threat_detected else "none",
                confidence=max_confidence,
                source_type="camera",
                detections=results,
                latitude=latitude,
                longitude=longitude,
                file_path=file_path if threat_detected else None,  # Only save path if threat detected
                metadata={"filename": filename, "location_desc": location_desc}
            )
            
            # Send notification if requested and a threat is detected
            if notify and threat_detected:
                notification_sent = notifications.send_threat_alert(
                    threat_type=threat_type,
                    confidence=max_confidence,
                    location_desc=location_desc,
                    latitude=latitude,
                    longitude=longitude
                )
                
                if notification_sent and threat_id:
                    # Update the database to mark as notified
                    database.mark_as_notified(threat_id)
        
        # Clean up the file in the background if no threat (otherwise keep for evidence)
        if not threat_detected or not threat_id:
            background_tasks.add_task(os.remove, file_path)
        
        # Return results with location and notification info
        return {
            "success": True,
            "message": f"Successfully captured and analyzed image from camera" + 
                      (f" - THREAT DETECTED: {threat_type.upper()}" if threat_detected else ""),
            "detections": results,
            "threat_id": threat_id,
            "location": {
                "latitude": latitude,
                "longitude": longitude,
                "description": location_desc
            } if latitude and longitude else None,
            "notification_sent": notification_sent if notify else None
        }
    
    except Exception as e:
        # Return error information
        logger.error(f"Error processing camera image: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing camera image: {str(e)}")


@app.get("/threats/", response_model=List[Dict])
async def get_recent_threats(limit: int = Query(10, ge=1, le=100)):
    """
    Get recent threat detections from the database.
    
    Args:
        limit: Maximum number of threats to return (1-100)
    """
    try:
        threats = database.get_recent_threats(limit)
          # Convert ObjectId to string for JSON serialization
        for threat in threats:
            if "_id" in threat:
                threat["_id"] = str(threat["_id"])  # Keep using _id for consistency
                
        return threats
    except Exception as e:
        logging.error(f"Error retrieving threats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve threats: {str(e)}")


@app.post("/notify/{threat_id}")
async def notify_about_threat(threat_id: str):
    """
    Send a notification about a specific threat to the forest ranger.
    
    Args:
        threat_id: ID of the threat to notify about
    """
    try:
        # Get the threat from the database
        from bson.objectid import ObjectId
        threat = database.threats_collection.find_one({"_id": ObjectId(threat_id)})
        
        if not threat:
            raise HTTPException(status_code=404, detail=f"Threat with ID {threat_id} not found")
        
        # Extract threat details
        threat_type = threat.get("threat_type", "unknown")
        confidence = threat.get("confidence", 0.5)
        
        # Get location data
        latitude = None
        longitude = None
        location_desc = None
        
        if "location" in threat and "coordinates" in threat["location"]:
            longitude, latitude = threat["location"]["coordinates"]
            
        if "metadata" in threat and "location_desc" in threat["metadata"]:
            location_desc = threat["metadata"]["location_desc"]
        
        # Send the notification
        notification_sent = notifications.send_threat_alert(
            threat_type=threat_type,
            confidence=confidence,
            location_desc=location_desc,
            latitude=latitude,
            longitude=longitude
        )
        
        if notification_sent:
            # Mark as notified
            database.mark_as_notified(threat_id)
            return {"success": True, "message": f"Notification sent for threat {threat_id}"}
        else:
            return {"success": False, "message": "Failed to send notification"}
            
    except Exception as e:
        logging.error(f"Error sending notification: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send notification: {str(e)}")


@app.get("/threat-details/{threat_id}")
async def get_threat_details(threat_id: str):
    """
    Get detailed information about a specific threat.
    
    Args:
        threat_id: ID of the threat to retrieve details for
    """
    # Validate threat_id before processing
    if not threat_id or threat_id == "undefined" or threat_id == "null":
        logging.warning(f"Invalid threat_id received: {threat_id}")
        raise HTTPException(status_code=400, detail="Invalid threat ID provided")
        
    try:
        # Convert string ID to ObjectId
        from bson.objectid import ObjectId
        from bson.errors import InvalidId
        
        try:
            obj_id = ObjectId(threat_id)
        except InvalidId:
            logging.warning(f"Invalid ObjectId format: {threat_id}")
            raise HTTPException(status_code=400, detail=f"Invalid threat ID format: {threat_id}")
            
        threat = database.threats_collection.find_one({"_id": obj_id})
        
        if not threat:
            raise HTTPException(status_code=404, detail=f"Threat with ID {threat_id} not found")
        
        # Convert ObjectId to string for JSON serialization
        threat["_id"] = str(threat["_id"])
        
        return threat
        
    except HTTPException:
        # Re-raise HTTP exceptions directly
        raise
    except Exception as e:
        logging.error(f"Error retrieving threat details: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve threat details: {str(e)}")


@app.post("/ranger-response/", response_model=dict)
async def submit_ranger_response(
    threat_id: str = Form(...),
    ranger_name: str = Form(...),
    action_taken: str = Form(...),
    response_details: str = Form(...),
    photo: Optional[UploadFile] = File(None)
):
    """
    Submit a ranger's response to a threat alert.
    
    Args:
        threat_id: ID of the threat being responded to
        ranger_name: Name of the ranger submitting the response
        action_taken: Type of action taken (investigated, resolved, etc.)
        response_details: Detailed description of the response
        photo: Optional photo evidence of the response
    """
    try:
        # Check if the threat exists
        from bson.objectid import ObjectId
        threat = database.threats_collection.find_one({"_id": ObjectId(threat_id)})
        
        if not threat:
            raise HTTPException(status_code=404, detail=f"Threat with ID {threat_id} not found")
        
        # Process the photo if provided
        evidence_photos = []
        if photo:
            # Generate a unique filename
            photo_filename = f"ranger_evidence_{uuid.uuid4()}_{photo.filename}"
            photo_path = TEMP_DIR / photo_filename
            
            # Save the uploaded photo
            with open(photo_path, "wb") as f:
                content = await photo.read()
                f.write(content)
            
            evidence_photos.append(str(photo_path))
        
        # Create response object
        import datetime
        response = {
            "threat_id": threat_id,
            "ranger_name": ranger_name,
            "action_taken": action_taken,
            "response_details": response_details,
            "evidence_photos": evidence_photos,
            "response_date": datetime.datetime.now().isoformat(),
            "threat_type": threat.get("threat_type", "unknown")
        }
        
        # Store in database
        response_id = database.store_ranger_response(response)
        
        # Update the threat status in the database
        database.update_threat_status(threat_id, "resolved")
        
        return {
            "success": True, 
            "message": "Ranger response submitted successfully",
            "response_id": str(response_id)
        }
            
    except Exception as e:
        logging.error(f"Error submitting ranger response: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to submit ranger response: {str(e)}")


@app.get("/ranger-response/", response_model=List[dict])
async def get_ranger_responses(limit: int = Query(20, ge=1, le=100)):
    """
    Get ranger responses to threat alerts.
    
    Args:
        limit: Maximum number of responses to return (1-100)
    """
    try:
        responses = database.get_ranger_responses(limit)
        
        # Convert ObjectId to string for JSON serialization
        for response in responses:
            if "_id" in response:
                response["_id"] = str(response["_id"])
        
        return responses
        
    except Exception as e:
        logging.error(f"Error retrieving ranger responses: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve ranger responses: {str(e)}")


@app.get("/ranger-response/{response_id}", response_model=dict)
async def get_ranger_response_details(response_id: str):
    """
    Get details for a specific ranger response.
    
    Args:
        response_id: ID of the ranger response to retrieve
    """
    try:
        # Convert string ID to ObjectId
        from bson.objectid import ObjectId
        response = database.ranger_responses_collection.find_one({"_id": ObjectId(response_id)})
        
        if not response:
            raise HTTPException(status_code=404, detail=f"Response with ID {response_id} not found")
        
        # Convert ObjectId to string for JSON serialization
        response["_id"] = str(response["_id"])
        
        return response
        
    except Exception as e:
        logging.error(f"Error retrieving ranger response details: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve ranger response details: {str(e)}")


@app.get("/")
async def root():
    """Root endpoint with basic API information."""
    return {
        "message": "Wildlife Threat Detection API",
        "version": "1.0.0",        "endpoints": [
            {"path": "/analyze-image/", "method": "POST", "description": "Analyze uploaded images using YOLOv8"},
            {"path": "/analyze-audio/", "method": "POST", "description": "Analyze uploaded audio using YAMNet"},
            {"path": "/capture-and-analyze/", "method": "POST", "description": "Auto-capture image from camera and analyze it"},
            {"path": "/manual-capture/", "method": "POST", "description": "Manually capture image from camera and analyze it"},
            {"path": "/threats/", "method": "GET", "description": "Get recent threat detections"},
            {"path": "/notify/{threat_id}", "method": "POST", "description": "Send notification for a specific threat"}
        ]
    }


# Run the app if executed directly
if __name__ == "__main__":
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
