"""
Notification utility for the Wildlife Threat Detection System.
This module provides functions to send SMS notifications to forest rangers.
"""

import os
import logging
from typing import Dict, List, Optional
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

# Configure logging
logger = logging.getLogger(__name__)

# Default forest ranger phone number
DEFAULT_RANGER_PHONE = "use your number here"  # Using the provided number with country code

# Twilio credentials - these should be stored in environment variables in production
# These are placeholder values and won't work for actual SMS sending
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "use your sid here")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "use your auth token here")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "use your phone number here")

# Initialize Twilio client
try:
    # Check if real credentials are provided
    if TWILIO_ACCOUNT_SID.startswith("AC") and len(TWILIO_ACCOUNT_SID) > 30 and len(TWILIO_AUTH_TOKEN) > 30:
        # Only try to initialize if credentials look legitimate
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        logger.info("Twilio client initialized successfully")
    else:
        # Use simulation mode
        client = None
        logger.warning("Using simulated SMS notifications (Twilio credentials not set)")
except Exception as e:
    logger.error(f"Failed to initialize Twilio client: {str(e)}")
    client = None

def send_threat_alert(
    threat_type: str,
    confidence: float,
    location_desc: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    phone_number: str = DEFAULT_RANGER_PHONE
) -> bool:
    """
    Send a threat alert SMS to the specified phone number.
    
    Args:
        threat_type: Type of the detected threat
        confidence: Confidence score of the detection (0-1)
        location_desc: Optional description of the location
        latitude: Optional latitude coordinate
        longitude: Optional longitude coordinate
        phone_number: Phone number to send the alert to (with country code)
        
    Returns:
        True if the message was sent successfully, False otherwise
    """
    # Format the message
    confidence_percent = int(confidence * 100)
    message_body = f"ALERT: {threat_type.upper()} detected with {confidence_percent}% confidence."
    
    # Add location information if available
    if location_desc:
        message_body += f"\nLocation: {location_desc}"
    
    # Add map link if coordinates are available
    if latitude is not None and longitude is not None:
        google_maps_link = f"https://maps.google.com/?q={latitude},{longitude}"
        message_body += f"\nLocation: {google_maps_link}"
    
    # Add action instructions
    message_body += "\nPlease investigate immediately."
    if client is None:
        # Simulate sending SMS
        logger.info(f"SIMULATED SMS to {phone_number}: {message_body}")
        print(f"\n========== SIMULATED SMS NOTIFICATION ==========")
        print(f"To: {phone_number}")
        print(f"Message: {message_body}")
        print(f"================================================\n")
        return True
    
    try:
        # Send the SMS using Twilio
        message = client.messages.create(
            body=message_body,
            from_=TWILIO_PHONE_NUMBER,
            to=phone_number
        )
        logger.info(f"Sent SMS notification to {phone_number}, SID: {message.sid}")
        return True
    except TwilioRestException as e:
        logger.error(f"Failed to send SMS: {str(e)}")
        print(f"\n========== SMS NOTIFICATION ERROR ==========")
        print(f"Error sending SMS to {phone_number}: {str(e)}")
        print(f"===========================================\n")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending SMS: {str(e)}")
        print(f"\n========== SMS NOTIFICATION ERROR ==========")
        print(f"Unexpected error sending SMS to {phone_number}: {str(e)}")
        print(f"===========================================\n")
        return False

def format_location_link(latitude: float, longitude: float) -> str:
    """
    Format a Google Maps link from latitude and longitude.
    
    Args:
        latitude: Latitude coordinate
        longitude: Longitude coordinate
        
    Returns:
        Google Maps URL
    """
    return f"https://maps.google.com/?q={latitude},{longitude}"
