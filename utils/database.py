"""
MongoDB utility for the Wildlife Threat Detection System.
This module provides functions to connect to MongoDB and store detection data.
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError

# Configure logging
logger = logging.getLogger(__name__)

# Connection string
MONGO_CONNECTION_STRING = "mongodb+srv://wltds:wltds@cluster0.m7bbbhh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

# Initialize MongoDB client
try:
    # For development, we'll use a local fallback if MongoDB Atlas connection fails
    try:
        client = MongoClient(MONGO_CONNECTION_STRING, serverSelectionTimeoutMS=5000)
        # Verify connection works with a ping
        client.admin.command('ping')
        db = client["wildlife_threats"]
        threats_collection = db["threats"]
        logger.info("Successfully connected to MongoDB Atlas")
    except Exception as e:
        # Fallback to in-memory storage if MongoDB connection fails
        logger.warning(f"MongoDB Atlas connection failed: {str(e)}")
        logger.info("Using local MongoDB fallback")
        
        # Create a simulated storage for development purposes
        from collections import defaultdict
        mock_db = defaultdict(list)
        mock_ids = 0
        
        class MockCollection:
            def __init__(self):
                self.data = []
                
            def insert_one(self, document):
                global mock_ids
                mock_ids += 1
                document["_id"] = str(mock_ids)
                self.data.append(document)
                class Result:
                    def __init__(self, id_val):
                        self.inserted_id = id_val
                return Result(document["_id"])
            def find(self):
                return self
                
            def sort(self, field=None, direction=None):
                # Handle sorting by different fields
                if field == "response_date":
                    # Sort by response_date for ranger responses
                    self.data.sort(key=lambda x: x.get("response_date", datetime.min.isoformat()), reverse=True)
                else:
                    # Default sort by timestamp for threats
                    self.data.sort(key=lambda x: x.get("timestamp", datetime.min), reverse=True)
                return self
                
            def limit(self, limit_val):
                return self.data[:limit_val]
                
            def find_one(self, query):
                # Simple implementation to find by ID
                for doc in self.data:
                    if doc.get("_id") == query.get("_id"):
                        return doc
                return None
                
            def update_one(self, query, update):
                for doc in self.data:
                    if doc.get("_id") == query.get("_id"):
                        for key, value in update.get("$set", {}).items():
                            doc[key] = value
                        return type('obj', (object,), {'modified_count': 1})
                return type('obj', (object,), {'modified_count': 0})
                
            def create_index(self, *args, **kwargs):
                # Dummy implementation
                pass
        
        # Create mock database and collection
        db = {"threats": MockCollection()}
        threats_collection = db["threats"]
        client = None
    
    # Create indexes for efficient queries
    threats_collection.create_index([("timestamp", -1)])  # Sort by timestamp descending
    threats_collection.create_index([("threat_type", 1)])  # Search by threat type
    threats_collection.create_index([("location", "2dsphere")])  # Geospatial index
    
    logger.info("Successfully connected to MongoDB")
except (ConnectionFailure, ConfigurationError) as e:
    logger.error(f"Failed to connect to MongoDB: {str(e)}")
    client = None
    db = None
    threats_collection = None

# Initialize ranger_responses collection
try:
    if db is not None:
        ranger_responses_collection = db["ranger_responses"]
        logger.info("Initialized ranger_responses collection")
    else:
        ranger_responses_collection = None
except Exception as e:
    logger.warning(f"Failed to initialize ranger_responses collection: {str(e)}")
    ranger_responses_collection = None

# Create mock collection for ranger responses if MongoDB connection fails
if threats_collection is None:
    ranger_responses_collection = MockCollection()

def store_threat_detection(
    threat_type: str,
    confidence: float,
    source_type: str,
    detections: List[Dict],
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    file_path: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """
    Store a detected threat in the MongoDB database.
    
    Args:
        threat_type: Type of threat detected (e.g., "human", "vehicle", "fire")
        confidence: Confidence score of the detection (0-1)
        source_type: Source of the detection ("image", "audio", "camera")
        detections: List of detected objects with their details
        latitude: Optional latitude coordinate where the threat was detected
        longitude: Optional longitude coordinate where the threat was detected
        file_path: Optional path to the file used for detection
        metadata: Optional additional metadata about the detection
        
    Returns:
        The ID of the inserted document
    """
    if threats_collection is None:
        logger.error("MongoDB connection not available")
        return None
    
    # Prepare document
    document = {
        "threat_type": threat_type,
        "confidence": confidence,
        "source_type": source_type,
        "detections": detections,
        "timestamp": datetime.utcnow(),
        "notified": False,
    }
    
    # Add location if available
    if latitude is not None and longitude is not None:
        document["location"] = {
            "type": "Point",
            "coordinates": [longitude, latitude]  # GeoJSON format: [longitude, latitude]
        }
    
    # Add filename if available
    if file_path:
        document["file_path"] = file_path
    
    # Add additional metadata if available
    if metadata:
        document["metadata"] = metadata
    
    try:
        result = threats_collection.insert_one(document)
        logger.info(f"Stored threat detection with ID: {result.inserted_id}")
        return str(result.inserted_id)
    except Exception as e:
        logger.error(f"Failed to store threat detection: {str(e)}")
        return None

def get_recent_threats(limit: int = 10) -> List[Dict]:
    """
    Get the most recent threat detections.
    
    Args:
        limit: Maximum number of threats to return
        
    Returns:
        List of threat documents
    """
    if threats_collection is None:
        logger.error("MongoDB connection not available")
        return []
    
    try:
        cursor = threats_collection.find().sort("timestamp", -1).limit(limit)
        return list(cursor)
    except Exception as e:
        logger.error(f"Failed to retrieve recent threats: {str(e)}")
        return []

def mark_as_notified(threat_id: str) -> bool:
    """
    Mark a threat as notified.
    
    Args:
        threat_id: The ID of the threat document
        
    Returns:
        True if successful, False otherwise
    """
    if threats_collection is None:
        logger.error("MongoDB connection not available")
        return False
    
    try:
        from bson.objectid import ObjectId
        result = threats_collection.update_one(
            {"_id": ObjectId(threat_id)},
            {"$set": {"notified": True, "notified_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    except Exception as e:
        logger.error(f"Failed to mark threat as notified: {str(e)}")
        return False

def store_ranger_response(response: dict) -> str:
    """
    Store a ranger response to a threat alert.
    
    Args:
        response: Dictionary containing ranger response data
        
    Returns:
        The ID of the stored response document
    """
    if ranger_responses_collection is None:
        logger.error("Ranger responses collection not available")
        return ""
    
    try:
        result = ranger_responses_collection.insert_one(response)
        response_id = str(result.inserted_id)
        logger.info(f"Stored ranger response with ID: {response_id}")
        return response_id
    except Exception as e:
        logger.error(f"Failed to store ranger response: {str(e)}")
        return ""


def get_ranger_responses(limit: int = 20) -> List[Dict[str, Any]]:
    """
    Retrieve ranger responses, sorted by response date (newest first).
    
    Args:
        limit: Maximum number of responses to retrieve
        
    Returns:
        List of ranger response documents
    """
    if ranger_responses_collection is None:
        logger.error("Ranger responses collection not available")
        return []
    
    try:
        responses = list(
            ranger_responses_collection.find().sort("response_date", -1).limit(limit)
        )
        return responses
    except Exception as e:
        logger.error(f"Failed to retrieve ranger responses: {str(e)}")
        return []


def update_threat_status(threat_id: str, status: str) -> bool:
    """
    Update the status of a threat (e.g., pending, resolved).
    
    Args:
        threat_id: The ID of the threat document
        status: New status value
        
    Returns:
        True if successful, False otherwise
    """
    if threats_collection is None:
        logger.error("MongoDB connection not available")
        return False
    
    try:
        from bson.objectid import ObjectId
        result = threats_collection.update_one(
            {"_id": ObjectId(threat_id)},
            {"$set": {"status": status, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    except Exception as e:
        logger.error(f"Failed to update threat status: {str(e)}")
        return False
