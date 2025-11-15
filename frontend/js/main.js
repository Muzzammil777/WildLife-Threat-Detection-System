// Wildlife Threat Detection System - Frontend JavaScript

// API Endpoints
const API_BASE_URL = "http://localhost:8000";
const API_ENDPOINTS = {
  ANALYZE_IMAGE: `${API_BASE_URL}/analyze-image/`,
  ANALYZE_AUDIO: `${API_BASE_URL}/analyze-audio/`,
  CAPTURE_AND_ANALYZE: `${API_BASE_URL}/capture-and-analyze/`,
  MANUAL_CAPTURE: `${API_BASE_URL}/manual-capture/`,
  THREATS: `${API_BASE_URL}/threats/`,
  NOTIFY: `${API_BASE_URL}/notify/`,
};

// DOM Elements
// Tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

// Image Upload
const imageUploadArea = document.getElementById("image-upload-area");
const imageUploadInput = document.getElementById("image-upload");
const analyzeImageBtn = document.getElementById("analyze-image-btn");
const imagePreviewContainer = document.getElementById(
  "image-preview-container"
);
const imagePreview = document.getElementById("image-preview");

// Camera
const cameraFeed = document.getElementById("camera-feed");
const cameraOverlay = document.getElementById("camera-overlay");
const startCameraBtn = document.getElementById("start-camera-btn");
const captureBtn = document.getElementById("capture-btn");
const autoCaptureBtn = document.getElementById("auto-capture-btn");
let autoCaptureInterval = null;
const analyzeCaptureBtn = document.getElementById("analyze-capture-btn");
const capturePreviewContainer = document.getElementById(
  "capture-preview-container"
);
const capturePreview = document.getElementById("capture-preview");

// Audio Upload
const audioUploadArea = document.getElementById("audio-upload-area");
const audioUploadInput = document.getElementById("audio-upload");
const analyzeAudioBtn = document.getElementById("analyze-audio-btn");
const audioPreviewContainer = document.getElementById(
  "audio-preview-container"
);
const audioPreview = document.getElementById("audio-preview");
const audioFilename = document.getElementById("audio-filename");

// Audio Mode Switching
const modeButtons = document.querySelectorAll(".mode-btn");
const audioModes = document.querySelectorAll(".audio-mode");

// Microphone
const startMicBtn = document.getElementById("start-mic-btn");
const stopMicBtn = document.getElementById("stop-mic-btn");
const micStatus = document.getElementById("mic-status");
const recordingIndicator = document.getElementById("recording-indicator");
const recordingTimeDisplay = document.querySelector(".recording-time");
const audioVisualizer = document.getElementById("audio-visualizer");
const micPlaceholder = document.querySelector(".mic-placeholder");

// Results and Loading
const resultsContainer = document.getElementById("results-container");
const resultsContent = document.getElementById("results-content");
const spinner = document.getElementById("spinner");

// Global Variables
let selectedImageFile = null;
let capturedImageBlob = null;
let selectedAudioFile = null;
let mediaStream = null;
let audioRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let recordingSeconds = 0;
let audioContext = null;
let audioAnalyzer = null;
let visualizationActive = false;
let currentLocation = {
  latitude: null,
  longitude: null,
  accuracy: null,
  timestamp: null,
};

// DOM elements for geolocation notice
const geoNotice = document.getElementById("geo-notice");
const geoNoticeClose = document.getElementById("geo-notice-close");

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  // Set up tab switching
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Set up event listeners
  setupImageUpload();
  setupCameraCapture();
  setupAudioUpload();
  setupAudioModes();

  // Set up geolocation notice
  setupGeoNotice();

  // Initialize geolocation tracking if available
  initGeolocation();
}

// Utility Functions
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function showSpinner() {
  spinner.style.display = "flex";
}

function hideSpinner() {
  spinner.style.display = "none";
}

// Event delegation for notification buttons that are dynamically added
document.addEventListener("click", async function (e) {
  if (
    e.target &&
    (e.target.classList.contains("notify-btn") ||
      e.target.closest(".notify-btn"))
  ) {
    const button = e.target.classList.contains("notify-btn")
      ? e.target
      : e.target.closest(".notify-btn");
    const threatId = button.dataset.threatId;

    if (threatId) {
      await notifyForestRanger(threatId, button);
    }
  }
});

// Function to notify forest ranger
async function notifyForestRanger(threatId, buttonEl) {
  try {
    buttonEl.disabled = true;
    buttonEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    const response = await fetch(`${API_ENDPOINTS.NOTIFY}${threatId}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (data.success) {
      // Update the UI to show notification sent
      const alertDiv = buttonEl.closest(".alert");
      alertDiv.classList.remove("alert-warning");
      alertDiv.classList.add("alert-info");
      alertDiv.innerHTML =
        '<i class="fas fa-bell"></i> <strong>Forest ranger has been notified</strong>';
    } else {
      buttonEl.disabled = false;
      buttonEl.innerHTML =
        '<i class="fas fa-exclamation-circle"></i> Failed - Try Again';
      console.error("Notification failed:", data.message);
    }
  } catch (error) {
    buttonEl.disabled = false;
    buttonEl.innerHTML =
      '<i class="fas fa-exclamation-circle"></i> Error - Try Again';
    console.error("Error sending notification:", error);
  }
}

function showResults(resultsData) {
  resultsContainer.style.display = "block";
  let html = "";

  if (resultsData.success) {
    // Add alert banner if threats were detected
    const threatDetected =
      resultsData.detections && resultsData.detections.some((d) => d.is_threat);

    if (threatDetected) {
      html += `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> 
          <strong>ALERT: Potential wildlife threat detected!</strong>
        </div>
      `;

      // Add notification info if available
      if (resultsData.notification_sent) {
        html += `
          <div class="alert alert-info">
            <i class="fas fa-bell"></i> 
            <strong>Forest ranger has been notified</strong>
          </div>
        `;
      } else if (resultsData.threat_id) {
        html += `
          <div class="alert alert-warning">
            <i class="fas fa-bell"></i> 
            <strong>Forest ranger notification pending</strong>
            <button class="notify-btn" data-threat-id="${resultsData.threat_id}">
              <i class="fas fa-paper-plane"></i> Notify Now
            </button>
          </div>
        `;
      }
    }

    // Add location information if available
    if (resultsData.location) {
      const loc = resultsData.location;
      html += `
        <div class="location-info">
          <h4><i class="fas fa-map-marker-alt"></i> Location Information</h4>
          <p>Coordinates: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(
        6
      )}</p>
          ${loc.description ? `<p>Area: ${loc.description}</p>` : ""}
          <p><a href="https://maps.google.com/?q=${loc.latitude},${
        loc.longitude
      }" target="_blank">
            <i class="fas fa-external-link-alt"></i> View on Google Maps
          </a></p>
        </div>
      `;
    }

    // Add detection results
    if (resultsData.detections && resultsData.detections.length > 0) {
      html += `<h4>Detection Results</h4>`;

      resultsData.detections.forEach((detection, index) => {
        const confidenceClass = getConfidenceClass(detection.confidence);
        const isThreat = detection.is_threat;

        html += `
          <div class="detection-item ${isThreat ? "threat-item" : ""}">
            <h4>Detection #${index + 1}: ${
          detection.class_name || detection.class
        }
              ${isThreat ? '<span class="threat-badge">THREAT</span>' : ""}
            </h4>
            <div class="detection-details">
              <div class="detection-detail ${confidenceClass}">
                <i class="fas fa-chart-line"></i> Confidence: ${(
                  detection.confidence * 100
                ).toFixed(1)}%
              </div>
        `;

        // Add bounding box details if available
        if (detection.bounding_box) {
          const bbox = detection.bounding_box;
          html += `
            <div class="detection-detail">
              <i class="fas fa-vector-square"></i> Location: (${bbox.x1.toFixed(
                0
              )},${bbox.y1.toFixed(0)}) to (${bbox.x2.toFixed(
            0
          )},${bbox.y2.toFixed(0)})
            </div>
          `;
        }

        html += `</div></div>`;
      });
    } else {
      html +=
        '<div class="no-detections"><i class="fas fa-info-circle"></i> No detections found in the analysis.</div>';
    }
  } else {
    html = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Error: ${
      resultsData.message || "An unknown error occurred"
    }</div>`;
  }

  resultsContent.innerHTML = html;
  resultsContainer.scrollIntoView({ behavior: "smooth" });

  // Add event listener for manual notification button
  const notifyButtons = document.querySelectorAll(".notify-btn");
  notifyButtons.forEach((btn) => {
    btn.addEventListener("click", () => notifyRanger(btn.dataset.threatId));
  });
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.7) {
    return "confidence-high";
  } else if (confidence >= 0.4) {
    return "confidence-medium";
  } else {
    return "confidence-low";
  }
}

// Tab Switching
function switchTab(tabId) {
  // Update active tab button
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  // Update active tab pane
  tabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === tabId);
  });
  // Clean up camera when switching away from camera tab
  if (tabId !== "camera-tab") {
    if (mediaStream) {
      stopCamera();
    }
    // Also ensure auto-capture is stopped when leaving the camera tab
    if (autoCaptureInterval) {
      stopAutoCapture();
    }
  }

  // Clean up microphone when switching away from audio tab
  if (tabId !== "audio-tab" && mediaStream && audioRecorder) {
    stopMicrophone();
  }
}

// Image Upload Handling
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    processSelectedImage(file);
  }
}

function handleImageDrop(e) {
  preventDefaults(e);

  if (e.dataTransfer.files.length) {
    const file = e.dataTransfer.files[0];
    if (file.type.match("image/*")) {
      processSelectedImage(file);
    }
  }
}

function processSelectedImage(file) {
  selectedImageFile = file;
  analyzeImageBtn.disabled = false;

  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreviewContainer.style.display = "block";
  };
  reader.readAsDataURL(file);
}

async function analyzeImage() {
  if (!selectedImageFile) return;

  showSpinner();

  const formData = new FormData();
  formData.append("file", selectedImageFile);

  // Add location data and notification setting
  addLocationToFormData(formData);

  try {
    const response = await fetch(API_ENDPOINTS.ANALYZE_IMAGE, {
      method: "POST",
      headers: {
        Accept: "application/json",
        // Don't set Content-Type when sending FormData - browser will set it with boundary
      },
      body: formData,
      cache: "no-cache",
      mode: "cors",
    });

    const data = await response.json();

    // Display additional location and notification info
    if (data.location) {
      console.log("Detection location:", data.location);
    }

    if (data.notification_sent) {
      console.log("Alert notification sent to forest ranger");
    }

    showResults(data);
  } catch (error) {
    console.error("Error analyzing image:", error);
    showResults({
      success: false,
      message: `API Error: ${error.message}. Make sure the API server is running.`,
    });
  } finally {
    hideSpinner();
  }
}

// Camera Handling
async function toggleCamera() {
  if (mediaStream) {
    stopCamera();
    startCameraBtn.innerHTML = '<i class="fas fa-video"></i> Start Camera';
    captureBtn.disabled = true;
    autoCaptureBtn.disabled = true;
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    cameraFeed.srcObject = mediaStream;
    cameraOverlay.style.display = "none";
    startCameraBtn.innerHTML = '<i class="fas fa-video-slash"></i> Stop Camera';
    captureBtn.disabled = false;
    autoCaptureBtn.disabled = false;
  } catch (error) {
    console.error("Error accessing camera:", error);
    const errorMessage = error.name === 'NotAllowedError' 
      ? "Camera access denied. Please allow camera permissions and try again."
      : error.name === 'NotFoundError'
      ? "No camera found. Please connect a camera and try again."
      : "Failed to access camera. Make sure it's connected and permissions are granted.";
    
    cameraOverlay.querySelector(".camera-message").textContent = errorMessage;
    
    // Show error notification
    showErrorNotification("Camera Access Error", errorMessage);
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    cameraFeed.srcObject = null;
    cameraOverlay.style.display = "flex";

    // Stop auto-capture if running
    stopAutoCapture();
  }
}

function captureImage() {
  if (!mediaStream) {
    console.error('No media stream available for capture');
    showErrorMessage({
      title: "Camera Error",
      message: "No camera stream available. Please start the camera first."
    });
    return;
  }

  // Use the backend API for server-side capture (recommended for consistency)
  performManualCapture();
}

async function analyzeCapture() {
  if (!capturedImageBlob) return;

  showSpinner();

  const formData = new FormData();
  formData.append("file", capturedImageBlob, "capture.jpg");

  // Add location data and notification setting
  addLocationToFormData(formData);

  try {
    const response = await fetch(API_ENDPOINTS.ANALYZE_IMAGE, {
      method: "POST",
      headers: {
        Accept: "application/json",
        // Don't set Content-Type when sending FormData - browser will set it with boundary
      },
      body: formData,
      cache: "no-cache",
      mode: "cors",
    });

    const data = await response.json();

    // Display additional location and notification info
    if (data.location) {
      console.log("Detection location:", data.location);
    }

    if (data.notification_sent) {
      console.log("Alert notification sent to forest ranger");
    }

    showResults(data);
  } catch (error) {
    console.error("Error analyzing captured image:", error);
    showResults({
      success: false,
      message: `API Error: ${error.message}. Make sure the API server is running.`,
    });
  } finally {
    hideSpinner();
  }
}

// Audio Upload Handling
function handleAudioUpload(e) {
  const file = e.target.files[0];
  if (file) {
    processSelectedAudio(file);
  }
}

function handleAudioDrop(e) {
  preventDefaults(e);

  if (e.dataTransfer.files.length) {
    const file = e.dataTransfer.files[0];
    if (
      file.type === "audio/wav" ||
      file.type === "audio/x-wav" ||
      file.type === "audio/mp3" ||
      file.type === "audio/mpeg" ||
      file.name.toLowerCase().endsWith(".mp3")
    ) {
      processSelectedAudio(file);
    }
  }
}

function processSelectedAudio(file) {
  selectedAudioFile = file;
  analyzeAudioBtn.disabled = false;

  audioPreview.src = URL.createObjectURL(file);
  audioFilename.textContent = file.name;
  audioPreviewContainer.style.display = "block";
}

async function analyzeAudio() {
  if (!selectedAudioFile) return;

  showSpinner();

  const formData = new FormData();
  formData.append("file", selectedAudioFile);

  // Add source information to help with backend processing
  const isRecordedAudio = selectedAudioFile.name === "microphone-recording.wav";
  formData.append("source", isRecordedAudio ? "microphone" : "upload");

  // Add location data and notification setting
  addLocationToFormData(formData);

  try {
    // Log the request for debugging
    console.log(
      `Sending audio for analysis: ${selectedAudioFile.name} (${
        selectedAudioFile.size
      } bytes, from ${isRecordedAudio ? "microphone" : "upload"})`
    );

    const response = await fetch(API_ENDPOINTS.ANALYZE_AUDIO, {
      method: "POST",
      headers: {
        Accept: "application/json",
        // Don't set Content-Type when sending FormData - browser will set it with boundary
      },
      body: formData,
      cache: "no-cache",
      mode: "cors",
    });

    // Check if the request was successful
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Display additional location and notification info
    if (data.location) {
      console.log("Detection location:", data.location);
    }

    if (data.notification_sent) {
      console.log("Alert notification sent to forest ranger");
    }

    showResults(data);
  } catch (error) {
    console.error("Error analyzing audio:", error);
    showResults({
      success: false,
      message: `API Error: ${error.message}. Make sure the API server is running.`,
    });

    // Show error notification
    showErrorNotification(
      "Audio Analysis Failed",
      `The server couldn't process your audio. ${error.message}`
    );
  } finally {
    hideSpinner();

    // If this was from a microphone recording, reset the microphone UI
    if (
      selectedAudioFile &&
      selectedAudioFile.name === "microphone-recording.wav"
    ) {
      micStatus.textContent = "Ready to record";
    }
  }
}

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
});

// Geolocation functions
function initGeolocation() {
  if ("geolocation" in navigator) {
    // Get initial location
    updateGeolocation();

    // Set up periodic location updates
    setInterval(updateGeolocation, 60000); // Update every minute

    console.log("Geolocation tracking initialized");
  } else {
    console.warn("Geolocation is not available in this browser");
  }
}

function updateGeolocation() {
  navigator.geolocation.getCurrentPosition(
    // Success callback
    (position) => {
      currentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
      console.log("Location updated:", currentLocation);
    },
    // Error callback
    (error) => {
      console.error("Geolocation error:", error.message);
    },
    // Options
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    }
  );
}

// Attach location data to form data
function addLocationToFormData(formData) {
  if (currentLocation.latitude !== null && currentLocation.longitude !== null) {
    formData.append("latitude", currentLocation.latitude);
    formData.append("longitude", currentLocation.longitude);
    console.log("Location data added to request:", {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    });
  } else {
    // If no location is available, show the geo notice again
    if (geoNotice) {
      geoNotice.style.display = "flex";

      // Add a special class to highlight the notice
      geoNotice.classList.add("geo-notice-highlight");

      // Remove the highlight after 3 seconds
      setTimeout(() => {
        geoNotice.classList.remove("geo-notice-highlight");
      }, 3000);
    }
    console.warn("No location data available for this request");
  }

  // Always enable notifications
  formData.append("notify", "true");
  return formData;
}

// Setup functions
function setupGeoNotice() {
  // Check if user has previously dismissed the notice
  const geoNoticeDismissed =
    localStorage.getItem("geoNoticeDismissed") === "true";

  if (geoNoticeDismissed) {
    geoNotice.style.display = "none";
  }

  // Add close button functionality
  geoNoticeClose.addEventListener("click", () => {
    geoNotice.style.display = "none";
    localStorage.setItem("geoNoticeDismissed", "true");
  });
}

function setupAudioModes() {
  // Add event listeners to mode buttons
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Remove active class from all buttons
      modeButtons.forEach((b) => b.classList.remove("active"));
      // Add active class to clicked button
      btn.classList.add("active");

      // Hide all modes
      audioModes.forEach((mode) => mode.classList.remove("active"));

      // Show the selected mode
      const modeToShow = btn.getAttribute("data-mode");
      document
        .getElementById(`audio-${modeToShow}-mode`)
        .classList.add("active");

      // Stop microphone if switching away from mic mode
      if (modeToShow !== "microphone" && mediaStream) {
        stopMicrophone();
      }
    });
  });

  // Set up microphone buttons
  startMicBtn.addEventListener("click", startMicrophone);
  stopMicBtn.addEventListener("click", stopAndAnalyzeAudio);
}

function setupImageUpload() {
  // Image upload event listeners
  imageUploadInput.addEventListener("change", handleImageUpload);
  imageUploadArea.addEventListener("dragenter", preventDefaults);
  imageUploadArea.addEventListener("dragover", preventDefaults);
  imageUploadArea.addEventListener("dragleave", preventDefaults);
  imageUploadArea.addEventListener("drop", handleImageDrop);
  // Add click event listener to trigger file input
  imageUploadArea.addEventListener("click", () => {
    imageUploadInput.click();
  });
  analyzeImageBtn.addEventListener("click", analyzeImage);
}

function setupCameraCapture() {
  // Camera event listeners
  startCameraBtn.addEventListener("click", toggleCamera);
  captureBtn.addEventListener("click", captureImage);
  autoCaptureBtn.addEventListener("click", toggleAutoCapture);
  analyzeCaptureBtn.addEventListener("click", analyzeCapture);
  
  console.log('Camera capture event listeners set up');
}

function setupAudioUpload() {
  // Audio upload event listeners
  audioUploadInput.addEventListener("change", handleAudioUpload);
  audioUploadArea.addEventListener("dragenter", preventDefaults);
  audioUploadArea.addEventListener("dragover", preventDefaults);
  audioUploadArea.addEventListener("dragleave", preventDefaults);
  audioUploadArea.addEventListener("drop", handleAudioDrop);
  // Add click event listener to trigger file input
  audioUploadArea.addEventListener("click", () => {
    audioUploadInput.click();
  });
  analyzeAudioBtn.addEventListener("click", analyzeAudio);
}

// Function to manually notify forest rangers
async function notifyRanger(threatId) {
  try {
    const response = await fetch(`${API_ENDPOINTS.NOTIFY}${threatId}/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notify: true }),
      cache: "no-cache",
      mode: "cors",
    });

    const data = await response.json();

    if (data.success) {
      alert("Forest ranger has been notified successfully.");
    } else {
      alert(`Failed to notify forest ranger: ${data.message}`);
    }
  } catch (error) {
    console.error("Error notifying forest ranger:", error);
    alert(`Error: ${error.message}`);
  }
}

// Microphone functions
async function startMicrophone() {
  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;

    // Initialize audio recording
    audioRecorder = new MediaRecorder(stream);
    audioChunks = [];

    // Event handlers for the audio recorder
    audioRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    audioRecorder.onstop = () => {
      // Create a blob from the audio chunks
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      selectedAudioFile = new File([audioBlob], "microphone-recording.wav", {
        type: "audio/wav",
      });

      // Preview the recorded audio
      const audioURL = URL.createObjectURL(audioBlob);
      audioPreview.src = audioURL;
      audioFilename.textContent = "Recorded Audio";
      audioPreviewContainer.style.display = "block";

      // Enable analyze button
      analyzeAudioBtn.disabled = false;

      // Update UI
      micStatus.textContent = "Recording completed";
      startMicBtn.disabled = false;
      stopMicBtn.disabled = true;
    };

    // Start recording
    audioRecorder.start();

    // Set up audio visualization
    setupAudioVisualization(stream);

    // Update UI
    micStatus.textContent = "Recording...";
    startMicBtn.disabled = true;
    stopMicBtn.disabled = false;
    recordingIndicator.style.display = "flex";

    // Start timer
    recordingSeconds = 0;
    updateRecordingTime();
    recordingInterval = setInterval(updateRecordingTime, 1000);

    console.log("Microphone recording started");
  } catch (error) {
    console.error("Error accessing microphone:", error);

    // Handle permission denied errors specifically
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      showErrorNotification(
        "Microphone Access Denied",
        "Please allow microphone access in your browser settings and try again."
      );
      micStatus.textContent = "Microphone access denied";
    } else if (error.name === "NotFoundError") {
      showErrorNotification(
        "No Microphone Found",
        "Please connect a microphone to your device and try again."
      );
      micStatus.textContent = "No microphone detected";
    } else {
      micStatus.textContent = "Error: " + error.message;
      showErrorNotification("Microphone Error", error.message);
    }

    // Reset UI state
    startMicBtn.disabled = false;
    stopMicBtn.disabled = true;
  }
}

function stopMicrophone() {
  if (audioRecorder && audioRecorder.state === "recording") {
    audioRecorder.stop();
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  // Stop visualization
  if (visualizationActive) {
    cancelAnimationFrame(visualizationActive);
    visualizationActive = false;
    micPlaceholder.style.display = "flex";
    audioVisualizer.style.display = "none";
  }

  // Stop timer
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }

  // Update UI
  recordingIndicator.style.display = "none";
  startMicBtn.disabled = false;
  stopMicBtn.disabled = true;
}

function stopAndAnalyzeAudio() {
  if (audioRecorder && audioRecorder.state === "recording") {
    audioRecorder.stop();

    // Hide recording indicator
    recordingIndicator.style.display = "none";

    // Show processing state
    micStatus.textContent = "Processing audio...";

    // Set a timeout to allow the audioRecorder.onstop handler to complete
    setTimeout(() => {
      // Automatically trigger analysis if we have a recorded file
      if (
        selectedAudioFile &&
        selectedAudioFile.name === "microphone-recording.wav"
      ) {
        analyzeAudio();
      }
    }, 500);
  }
}

function updateRecordingTime() {
  recordingSeconds++;
  const minutes = Math.floor(recordingSeconds / 60);
  const seconds = recordingSeconds % 60;
  recordingTimeDisplay.textContent = `${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Automatically stop after 60 seconds
  if (recordingSeconds >= 60) {
    stopAndAnalyzeAudio();
  }
}

function setupAudioVisualization(stream) {
  // Set up audio context
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  audioAnalyzer = audioContext.createAnalyser();
  audioAnalyzer.fftSize = 256;
  source.connect(audioAnalyzer);

  // Set up canvas
  const canvas = audioVisualizer;
  const canvasCtx = canvas.getContext("2d");
  const bufferLength = audioAnalyzer.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  // Hide placeholder and show canvas
  micPlaceholder.style.display = "none";
  audioVisualizer.style.display = "block";

  // Start visualization
  function draw() {
    visualizationActive = requestAnimationFrame(draw);

    audioAnalyzer.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = "#f8f9fa";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = dataArray[i] / 2;

      // Use color gradient based on frequency
      const hue = (i / bufferLength) * 120 + 120; // From green to blue
      canvasCtx.fillStyle = `hsl(${hue}, 70%, 60%)`;

      canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  draw();
}

// Show error notification
function showErrorNotification(title, message) {
  const notification = document.createElement("div");
  notification.className = "error-notification";
  notification.innerHTML = `
    <div class="notification-title">
      <i class="fas fa-exclamation-circle"></i> ${title}
    </div>
    <div class="notification-message">${message}</div>
    <button class="notification-close"><i class="fas fa-times"></i></button>
  `;

  document.body.appendChild(notification);

  // Add close button functionality
  const closeButton = notification.querySelector(".notification-close");
  closeButton.addEventListener("click", () => {
    notification.classList.add("notification-hiding");
    setTimeout(() => notification.remove(), 300);
  });

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.classList.add("notification-hiding");
      setTimeout(() => notification.remove(), 300);
    }
  }, 10000);
}

function toggleAutoCapture() {
  if (autoCaptureInterval) {
    stopAutoCapture();
  } else {
    startAutoCapture();
  }
}

function startAutoCapture() {
  if (!mediaStream) {
    console.error('Cannot start auto capture: No media stream available');
    showErrorMessage({
      title: "Auto Capture Error",
      message: "Cannot start auto capture. Please start the camera first."
    });
    return;
  }

  // Change button appearance
  autoCaptureBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Auto';
  autoCaptureBtn.classList.add("active");

  // Start the interval (capture every 5 seconds)
  autoCaptureInterval = setInterval(async () => {
    await performAutoCapture();
  }, 5000); // 5 seconds

  // Do an initial capture immediately
  performAutoCapture();
  
  console.log('Auto capture started');
}

function stopAutoCapture() {
  if (autoCaptureInterval) {
    clearInterval(autoCaptureInterval);
    autoCaptureInterval = null;

    // Reset button appearance
    autoCaptureBtn.innerHTML = '<i class="fas fa-sync"></i> Auto Capture';
    autoCaptureBtn.classList.remove("active");
  }
}

async function performAutoCapture() {
  if (!mediaStream) return;

  showSpinner();

  try {
    // Make a request to the auto-capture endpoint
    const params = new URLSearchParams();

    // Add location data if available
    if (currentLocation.latitude && currentLocation.longitude) {
      params.append("latitude", currentLocation.latitude);
      params.append("longitude", currentLocation.longitude);
    }

    // Set notify=true to automatically notify rangers if threat is detected
    params.append("notify", "true");

    const response = await fetch(
      `${API_ENDPOINTS.CAPTURE_AND_ANALYZE}?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    // Show results
    showResults(data);
  } catch (error) {
    console.error("Error during auto-capture:", error);

    // Show error but don't stop the auto-capture cycle
    showErrorMessage({
      title: "Auto-Capture Error",
      message: `Error during auto-capture: ${error.message}. The system will try again in 5 seconds.`,
    });
  } finally {
    hideSpinner();
  }
}

async function performManualCapture() {
  if (!mediaStream) return;

  showSpinner();

  try {
    // Make a request to the manual capture endpoint
    const params = new URLSearchParams();

    // Add location data if available
    if (currentLocation.latitude && currentLocation.longitude) {
      params.append("latitude", currentLocation.latitude);
      params.append("longitude", currentLocation.longitude);
    }

    // Set notify=true to automatically notify rangers if threat is detected
    params.append("notify", "true");

    const response = await fetch(
      `${API_ENDPOINTS.MANUAL_CAPTURE}?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    // Show results
    showResults(data);
  } catch (error) {
    console.error("Error during manual capture:", error);

    showErrorMessage({
      title: "Manual Capture Error",
      message: `Failed to capture image: ${error.message}`,
    });
  } finally {
    hideSpinner();
  }
}

// Show error message in the results area
function showErrorMessage(error) {
  resultsContainer.style.display = "block";

  let html = `
    <div class="alert alert-danger">
      <i class="fas fa-exclamation-circle"></i> 
      <strong>${error.title || "Error"}</strong>
      <p>${error.message || "An unexpected error occurred."}</p>
    </div>
  `;

  resultsContent.innerHTML = html;
  resultsContainer.scrollIntoView({ behavior: "smooth" });
}
