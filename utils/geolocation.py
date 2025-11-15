"""
Geolocation utility for the Wildlife Threat Detection System.
This module provides functions to work with geolocation data.
"""

import os
import logging
from typing import Dict, Tuple, Optional
from geopy.geocoders import Nominatim
import random

# Configure logging
logger = logging.getLogger(__name__)

# Initialize geocoder with Wildlife Threat Detection System as the user agent
try:
    geolocator = Nominatim(user_agent="wildlife_threat_detection")
    logger.info("Geolocation service initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize geolocation service: {str(e)}")
    geolocator = None

# Default coordinates (can be set to a known wildlife area or park)
DEFAULT_LATITUDE = 10.7905
DEFAULT_LONGITUDE = 78.7047
    
def get_current_location() -> Tuple[float, float]:
    """
    Get the current location coordinates.
    In a real-world application, this would use GPS or network-based location.
    For demo purposes, this returns the default location with small random variations.
    
    Returns:
        Tuple of (latitude, longitude)
    """
    # In a real application, you would get this from the device's GPS
    # For simulation, we add a small random variation to the default coordinates
    variation = random.uniform(-0.01, 0.01)
    return (DEFAULT_LATITUDE + variation, DEFAULT_LONGITUDE + variation)

def get_location_description(latitude: float, longitude: float) -> Optional[str]:
    """
    Get a human-readable description of a location based on coordinates.
    
    Args:
        latitude: Latitude coordinate
        longitude: Longitude coordinate
        
    Returns:
        String description of the location, or None if geocoding failed
    """
    if geolocator is None:
        return None
    
    try:
        location = geolocator.reverse((latitude, longitude), language="en")
        return location.address if location else None
    except Exception as e:
        logger.error(f"Failed to get location description: {str(e)}")
        return None

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance between two points in kilometers.
    
    Args:
        lat1: Latitude of point 1
        lon1: Longitude of point 1
        lat2: Latitude of point 2
        lon2: Longitude of point 2
        
    Returns:
        Distance in kilometers
    """
    from geopy.distance import geodesic
    return geodesic((lat1, lon1), (lat2, lon2)).kilometers
