// Ranger Response System JavaScript

// API Endpoints
const API_BASE_URL = "http://localhost:8000";
const API_ENDPOINTS = {
  THREATS: `${API_BASE_URL}/threats/`,
  RANGER_RESPONSE: `${API_BASE_URL}/ranger-response/`,
  THREAT_DETAILS: `${API_BASE_URL}/threat-details/`,
};

// DOM Elements
const refreshPendingBtn = document.getElementById("refresh-pending-btn");
const pendingAlertsList = document.getElementById("pending-alerts");
const completedResponsesList = document.getElementById("completed-responses");
const responseModal = document.getElementById("response-modal");
const closeModalBtn = document.querySelector(".close-modal");
const cancelBtn = document.querySelector(".cancel-btn");
const responseForm = document.getElementById("ranger-response-form");
const alertDetails = document.getElementById("alert-details");
const photoUpload = document.getElementById("photo-upload");
const uploadPreview = document.getElementById("upload-preview");
const statusFilter = document.getElementById("status-filter");
const rangerFilter = document.getElementById("ranger-filter");

// State variables
let currentThreats = [];
let currentResponses = [];

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  // Set up event listeners
  refreshPendingBtn.addEventListener("click", refreshPendingAlerts);
  closeModalBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  responseForm.addEventListener("submit", handleResponseSubmit);
  photoUpload.addEventListener("change", handlePhotoUpload);
  statusFilter.addEventListener("change", applyFilters);
  rangerFilter.addEventListener("change", applyFilters);

  // Close modal when clicking outside of it
  window.addEventListener("click", (e) => {
    if (e.target === responseModal) {
      closeModal();
    }
  });

  // Initial data loading
  loadPendingAlerts();
  loadCompletedResponses();
}

// Fetch pending alerts from the API
async function loadPendingAlerts() {
  pendingAlertsList.innerHTML =
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading pending alerts...</div>';

  try {
    const response = await fetch(`${API_ENDPOINTS.THREATS}?status=pending`);
    const data = await response.json();

    if (response.ok) {
      currentThreats = data;
      renderPendingAlerts(data);
    } else {
      throw new Error(data.message || "Failed to load pending alerts");
    }
  } catch (error) {
    console.error("Error loading pending alerts:", error);
    pendingAlertsList.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i> 
        Error loading pending alerts: ${error.message}
      </div>
    `;
  }
}

// Fetch completed responses from the API
async function loadCompletedResponses() {
  completedResponsesList.innerHTML =
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading completed responses...</div>';

  try {
    const response = await fetch(`${API_ENDPOINTS.RANGER_RESPONSE}`);
    const data = await response.json();

    if (response.ok) {
      currentResponses = data;
      renderCompletedResponses(data);
    } else {
      throw new Error(data.message || "Failed to load completed responses");
    }
  } catch (error) {
    console.error("Error loading completed responses:", error);
    completedResponsesList.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i> 
        Error loading completed responses: ${error.message}
      </div>
    `;
  }
}

// Render pending alerts in the UI
function renderPendingAlerts(alerts) {
  console.log("Rendering alerts:", alerts);
  if (!alerts || alerts.length === 0) {
    pendingAlertsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-check-circle"></i>
        <p>No pending alerts at this time. Great job!</p>
      </div>
    `;
    return;
  }

  let html = "";

  alerts.forEach((alert) => {
    // Debug any alerts with missing IDs
    if (!alert._id && !alert.id) {
      console.error("Alert missing ID:", alert);
    }

    // Use either _id or id, depending on what's available
    const alertId = alert._id || alert.id || "";

    const date = new Date(alert.timestamp).toLocaleString();
    const threatType =
      alert.threat_type.charAt(0).toUpperCase() + alert.threat_type.slice(1);
    const threatIcon = getThreatIcon(alert.threat_type);

    html += `
      <div class="alert-item" data-id="${alert._id}">
        <div class="alert-icon">
          <i class="${threatIcon}"></i>
        </div>
        <div class="alert-info">
          <h3 class="alert-title">${threatType} Threat Detected</h3>
          <div class="alert-meta">
            <div class="alert-meta-item">
              <i class="fas fa-calendar"></i> ${date}
            </div>
            <div class="alert-meta-item">
              <i class="fas fa-exclamation-circle"></i> Confidence: ${(
                alert.confidence * 100
              ).toFixed(1)}%
            </div>
          </div>
          <div class="alert-location">
            <i class="fas fa-map-marker-alt"></i> ${
              alert.location_description || "Unknown Location"
            }
          </div>
        </div>        <div class="alert-actions">
          <button class="action-btn view-btn" onclick="viewThreatDetails('${alertId}')">
            <i class="fas fa-eye"></i> View Details
          </button>
          <button class="action-btn respond-btn" onclick="openResponseForm('${alertId}')">
            <i class="fas fa-reply"></i> Respond
          </button>
        </div>
      </div>
    `;
  });

  pendingAlertsList.innerHTML = html;
}

// Render completed responses in the UI
function renderCompletedResponses(responses) {
  if (!responses || responses.length === 0) {
    completedResponsesList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard"></i>
        <p>No completed responses yet.</p>
      </div>
    `;
    return;
  }

  let html = "";

  responses.forEach((response) => {
    const date = new Date(response.response_date).toLocaleString();
    const actionType = getActionDisplayName(response.action_taken);

    html += `
      <div class="response-item" data-id="${response._id}">
        <div class="response-header">
          <h3 class="response-title">${
            response.threat_type
          } Threat Response</h3>
          <span class="response-date">${date}</span>
        </div>
        <div class="response-meta">
          <div class="response-ranger">
            <i class="fas fa-user-shield"></i> Ranger: ${response.ranger_name}
          </div>
          <div class="response-action">${actionType}</div>
        </div>
        <div class="response-details">
          ${response.response_details}
        </div>
        ${
          response.evidence_photos && response.evidence_photos.length > 0
            ? `
          <div class="response-evidence">
            <div class="evidence-title">Evidence Photos:</div>
            <div class="evidence-images">
              ${response.evidence_photos
                .map(
                  (photo) => `
                <img src="${photo}" alt="Evidence" class="evidence-image" onclick="viewFullImage('${photo}')">
              `
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;
  });

  completedResponsesList.innerHTML = html;
}

// Open the response form modal with threat details
async function openResponseForm(threatId) {
  // Validate threatId before proceeding
  if (!threatId || threatId === "undefined" || threatId === "null") {
    console.error("Invalid threat ID:", threatId);
    alert("Error: Invalid threat ID. Please refresh the page and try again.");
    return;
  }

  // Find the threat in our current data or fetch it
  let threat = currentThreats.find((t) => t._id === threatId);

  if (!threat) {
    // Fetch the threat details if not in the current data
    try {
      const response = await fetch(
        `${API_ENDPOINTS.THREAT_DETAILS}${threatId}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      threat = await response.json();
    } catch (error) {
      console.error("Error loading threat details:", error);
      alert(`Error loading threat details: ${error.message}`);
      return;
    }
  }

  // Populate the hidden threat ID field
  document.getElementById("threat-id").value = threatId;

  // Populate the threat details section
  const date = new Date(threat.timestamp).toLocaleString();
  const threatType =
    threat.threat_type.charAt(0).toUpperCase() + threat.threat_type.slice(1);

  alertDetails.innerHTML = `
    <h3>${threatType} Threat Details</h3>
    <div class="alert-details-grid">
      <div class="alert-detail-item">
        <div class="alert-detail-label">Date & Time</div>
        <div class="alert-detail-value">${date}</div>
      </div>
      <div class="alert-detail-item">
        <div class="alert-detail-label">Confidence</div>
        <div class="alert-detail-value">${(threat.confidence * 100).toFixed(
          1
        )}%</div>
      </div>
      <div class="alert-detail-item">
        <div class="alert-detail-label">Location</div>
        <div class="alert-detail-value">${
          threat.location_description || "Unknown Location"
        }</div>
      </div>
      <div class="alert-detail-item">
        <div class="alert-detail-label">Source</div>
        <div class="alert-detail-value">${
          threat.source_type.charAt(0).toUpperCase() +
          threat.source_type.slice(1)
        }</div>
      </div>
    </div>
  `;

  // Clear the form
  responseForm.reset();
  uploadPreview.innerHTML = "";

  // Show the modal
  responseModal.style.display = "block";
}

// Close the response modal
function closeModal() {
  responseModal.style.display = "none";
}

// Handle the response form submission
async function handleResponseSubmit(e) {
  e.preventDefault();

  const threatId = document.getElementById("threat-id").value;
  const actionTaken = document.getElementById("action-taken").value;
  const rangerName = document.getElementById("ranger-name").value;
  const responseDetails = document.getElementById("response-details").value;

  // Create FormData for file upload
  const formData = new FormData();
  formData.append("threat_id", threatId);
  formData.append("action_taken", actionTaken);
  formData.append("ranger_name", rangerName);
  formData.append("response_details", responseDetails);

  // Add photo if one was uploaded
  const photoFile = photoUpload.files[0];
  if (photoFile) {
    formData.append("photo", photoFile);
  }

  try {
    // Disable the submit button and show loading state
    const submitBtn = document.querySelector(".submit-btn");
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    const response = await fetch(API_ENDPOINTS.RANGER_RESPONSE, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to submit response");
    }

    // Show success message
    alert("Response submitted successfully!");

    // Close the modal
    closeModal();

    // Refresh the data
    loadPendingAlerts();
    loadCompletedResponses();
  } catch (error) {
    console.error("Error submitting response:", error);
    alert(`Error submitting response: ${error.message}`);
  } finally {
    // Re-enable the submit button
    const submitBtn = document.querySelector(".submit-btn");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

// Handle photo upload preview
function handlePhotoUpload(e) {
  const file = photoUpload.files[0];

  if (file) {
    const reader = new FileReader();

    reader.onload = function (e) {
      uploadPreview.innerHTML = `<img src="${e.target.result}" alt="Upload Preview">`;
    };

    reader.readAsDataURL(file);
  } else {
    uploadPreview.innerHTML = "";
  }
}

// View full-size image
function viewFullImage(imageSrc) {
  const modal = document.createElement("div");
  modal.className = "image-modal";
  modal.innerHTML = `
    <div class="image-modal-content">
      <span class="close-image-modal">&times;</span>
      <img src="${imageSrc}" alt="Full size image">
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".close-image-modal");
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// View threat details
async function viewThreatDetails(threatId) {
  // Validate threatId before proceeding
  if (!threatId || threatId === "undefined" || threatId === "null") {
    console.error("Invalid threat ID:", threatId);
    alert("Error: Invalid threat ID. Please refresh the page and try again.");
    return;
  }

  // Implement this functionality if needed
  // Could open a modal with more detailed information about the threat
  alert("View details functionality to be implemented");
}

// Apply filters
function applyFilters() {
  const status = statusFilter.value;
  const ranger = rangerFilter.value;

  // This is a placeholder for filter functionality
  // In a real implementation, you would call the API with these filter parameters
  alert(`Applied filters - Status: ${status}, Ranger: ${ranger}`);

  // Refresh data with filters
  loadPendingAlerts();
  loadCompletedResponses();
}

// Refresh pending alerts
function refreshPendingAlerts() {
  loadPendingAlerts();
}

// Utility function to get an appropriate icon based on the threat type
function getThreatIcon(threatType) {
  const icons = {
    human: "fas fa-user",
    vehicle: "fas fa-car",
    fire: "fas fa-fire",
    weapon: "fas fa-crosshairs",
    poaching: "fas fa-skull",
    deforestation: "fas fa-tree",
    pollution: "fas fa-trash",
    default: "fas fa-exclamation-triangle",
  };

  return icons[threatType.toLowerCase()] || icons.default;
}

// Get a display name for an action type
function getActionDisplayName(actionType) {
  const actionNames = {
    investigated: "Site Investigated",
    resolved: "Threat Resolved",
    falseAlarm: "False Alarm",
    monitoringInitiated: "Monitoring Initiated",
    lawEnforcement: "Law Enforcement Contacted",
    other: "Other Action",
  };

  return actionNames[actionType] || actionType;
}
