// Wildlife Threat Dashboard - Frontend JavaScript

// API Endpoints
const API_BASE_URL = "http://localhost:8000";
const API_ENDPOINTS = {
  THREATS: `${API_BASE_URL}/threats/`,
  NOTIFY: `${API_BASE_URL}/notify/`,
};

// DOM Elements
const threatList = document.getElementById("threat-list");
const refreshThreatsBtn = document.getElementById("refresh-threats-btn");
const timeFilter = document.getElementById("time-filter");
const threatTypeFilter = document.getElementById("threat-type-filter");
const notificationFilter = document.getElementById("notification-filter");
const modal = document.getElementById("threat-modal");
const modalBody = document.getElementById("modal-body");
const notifyRangerBtn = document.getElementById("notify-ranger-btn");
const closeModalBtns = document.querySelectorAll(".close-modal, .close-btn");

// State
let threats = [];
let currentThreat = null;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  // Set up event listeners
  refreshThreatsBtn.addEventListener("click", fetchThreats);

  // Filter events
  timeFilter.addEventListener("change", applyFilters);
  threatTypeFilter.addEventListener("change", applyFilters);
  notificationFilter.addEventListener("change", applyFilters);

  // Modal events
  closeModalBtns.forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });

  notifyRangerBtn.addEventListener("click", notifyRangerForCurrentThreat);

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Load threats on page load
  fetchThreats();
}

// Fetch threats from API
async function fetchThreats() {
  try {
    showLoading();

    const response = await fetch(API_ENDPOINTS.THREATS);
    const data = await response.json();

    threats = data;
    console.log("Fetched threats:", threats);

    applyFilters();
  } catch (error) {
    console.error("Error fetching threats:", error);
    threatList.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        Failed to load threats. Please try again later.
      </div>
    `;
  }
}

// Apply filters to threats
function applyFilters() {
  const timeValue = timeFilter.value;
  const typeValue = threatTypeFilter.value;
  const notificationValue = notificationFilter.value;

  let filteredThreats = [...threats];

  // Apply time filter
  if (timeValue !== "all") {
    const now = new Date();
    let cutoff = new Date();

    switch (timeValue) {
      case "today":
        cutoff.setHours(0, 0, 0, 0);
        break;
      case "week":
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      case "month":
        cutoff.setMonth(cutoff.getMonth() - 1);
        break;
    }

    filteredThreats = filteredThreats.filter((threat) => {
      const threatDate = new Date(threat.timestamp);
      return threatDate >= cutoff;
    });
  }

  // Apply threat type filter
  if (typeValue !== "all") {
    filteredThreats = filteredThreats.filter((threat) => {
      const threatType = threat.threat_type?.toLowerCase() || "";

      switch (typeValue) {
        case "human":
          return threatType.includes("person");
        case "vehicle":
          return ["car", "truck", "motorcycle", "boat"].some((v) =>
            threatType.includes(v)
          );
        case "fire":
          return ["fire", "smoke"].some((v) => threatType.includes(v));
        case "weapon":
          return ["gun", "knife", "axe", "chainsaw"].some((v) =>
            threatType.includes(v)
          );
        default:
          return true;
      }
    });
  }

  // Apply notification filter
  if (notificationValue !== "all") {
    filteredThreats = filteredThreats.filter((threat) => {
      if (notificationValue === "sent") {
        return threat.notification_sent === true;
      } else {
        return threat.notification_sent !== true;
      }
    });
  }

  // Display filtered threats
  displayThreats(filteredThreats);
}

// Show threats in the list
function displayThreats(threatsToShow) {
  if (threatsToShow.length === 0) {
    threatList.innerHTML = `
      <div class="no-threats">
        <i class="fas fa-search"></i>
        <p>No threats found matching your filters</p>
      </div>
    `;
    return;
  }

  let html = "";

  threatsToShow.forEach((threat) => {
    const threatIcon = getThreatIcon(threat.threat_type);
    const threatDate = formatDate(threat.timestamp);
    const notificationStatus = threat.notification_sent
      ? '<span class="threat-status status-notified">Notified</span>'
      : '<span class="threat-status status-pending">Pending</span>';

    html += `
      <div class="threat-item" data-threat-id="${threat.id}">
        <div class="threat-icon ${threatIcon.class}">
          <i class="fas fa-${threatIcon.icon}"></i>
        </div>
        <div class="threat-details">
          <div class="threat-header">
            <span class="threat-title">${threat.threat_type}</span>
            <span class="threat-time">${threatDate}</span>
          </div>
          <div class="threat-location">
            <i class="fas fa-map-marker-alt"></i> ${getLocationText(threat)}
          </div>
        </div>
        ${notificationStatus}
      </div>
    `;
  });

  threatList.innerHTML = html;

  // Add event listeners to threat items
  document.querySelectorAll(".threat-item").forEach((item) => {
    item.addEventListener("click", () => {
      const threatId = item.dataset.threatId;
      const threat = threatsToShow.find((t) => t.id === threatId);
      if (threat) {
        showThreatDetails(threat);
      }
    });
  });
}

// Show loading state
function showLoading() {
  threatList.innerHTML = `
    <div class="loading-threats">
      <div class="spinner"></div>
      <p>Loading threats...</p>
    </div>
  `;
}

// Get icon based on threat type
function getThreatIcon(threatType) {
  const type = (threatType || "").toLowerCase();

  if (type.includes("person")) {
    return { icon: "user", class: "person" };
  } else if (
    ["car", "truck", "motorcycle", "boat"].some((v) => type.includes(v))
  ) {
    return { icon: "car", class: "vehicle" };
  } else if (type.includes("fire") || type.includes("smoke")) {
    return { icon: "fire", class: "fire" };
  } else if (
    ["gun", "knife", "axe", "chainsaw"].some((v) => type.includes(v))
  ) {
    return { icon: "exclamation-triangle", class: "weapon" };
  } else {
    return { icon: "exclamation-circle", class: "person" };
  }
}

// Format a date string
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Get readable location text
function getLocationText(threat) {
  if (threat.metadata && threat.metadata.location_desc) {
    return threat.metadata.location_desc;
  } else if (
    threat.location &&
    threat.location.coordinates &&
    threat.location.coordinates.length >= 2
  ) {
    const [long, lat] = threat.location.coordinates;
    return `Lat: ${lat.toFixed(6)}, Lng: ${long.toFixed(6)}`;
  } else {
    return "Unknown location";
  }
}

// Show threat details in modal
function showThreatDetails(threat) {
  currentThreat = threat;

  const threatIcon = getThreatIcon(threat.threat_type);
  const notificationStatus = threat.notification_sent
    ? '<span class="status-notified"><i class="fas fa-check-circle"></i> Forest ranger notified</span>'
    : '<span class="status-pending"><i class="fas fa-clock"></i> Notification pending</span>';

  const confidencePercent = Math.round((threat.confidence || 0) * 100);

  let html = `
    <div class="threat-detail-header">
      <h3>
        <i class="fas fa-${threatIcon.icon} ${threatIcon.class}"></i> 
        ${threat.threat_type}
      </h3>
      <div>${notificationStatus}</div>
    </div>
    
    <div class="threat-detail-section">
      <h3><i class="fas fa-chart-line"></i> Threat Assessment</h3>
      <p>Confidence Level:</p>
      <div class="threat-confidence">
        <div class="threat-confidence-bar" style="width: ${confidencePercent}%">
          ${confidencePercent}%
        </div>
      </div>
    </div>
    
    <div class="threat-detail-section">
      <h3><i class="fas fa-map-marked-alt"></i> Location Information</h3>
      <p>${getLocationText(threat)}</p>
      <div class="detail-map">
        <a href="https://maps.google.com/?q=${
          threat.location?.coordinates?.[1]
        },${threat.location?.coordinates?.[0]}" target="_blank">
          View on Google Maps
        </a>
      </div>
    </div>
    
    <div class="threat-detail-section">
      <h3><i class="fas fa-calendar-alt"></i> Detection Time</h3>
      <p>${new Date(threat.timestamp).toLocaleString()}</p>
    </div>
  `;

  if (threat.source_file) {
    html += `
      <div class="threat-detail-section">
        <h3><i class="fas fa-file-image"></i> Source File</h3>
        <p>${threat.source_file}</p>
      </div>
    `;
  }

  modalBody.innerHTML = html;

  // Update notify button state
  notifyRangerBtn.disabled = threat.notification_sent;
  notifyRangerBtn.innerHTML = threat.notification_sent
    ? '<i class="fas fa-check"></i> Already Notified'
    : '<i class="fas fa-bell"></i> Notify Forest Ranger';

  // Show modal
  modal.style.display = "block";
}

// Close modal
function closeModal() {
  modal.style.display = "none";
  currentThreat = null;
}

// Send notification for the current threat
async function notifyRangerForCurrentThreat() {
  if (!currentThreat || currentThreat.notification_sent) return;

  try {
    notifyRangerBtn.disabled = true;
    notifyRangerBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Sending...';

    const response = await fetch(`${API_ENDPOINTS.NOTIFY}${currentThreat.id}`, {
      method: "POST",
    });

    const data = await response.json();

    if (data.success) {
      // Update button
      notifyRangerBtn.innerHTML =
        '<i class="fas fa-check"></i> Notification Sent';

      // Update current threat
      currentThreat.notification_sent = true;

      // Update in threats array
      const threatIndex = threats.findIndex((t) => t.id === currentThreat.id);
      if (threatIndex !== -1) {
        threats[threatIndex].notification_sent = true;
      }

      // Update modal content
      const statusElem = modalBody.querySelector(".status-pending");
      if (statusElem) {
        statusElem.className = "status-notified";
        statusElem.innerHTML =
          '<i class="fas fa-check-circle"></i> Forest ranger notified';
      }

      // Update the list view
      const listItem = document.querySelector(
        `.threat-item[data-threat-id="${currentThreat.id}"] .threat-status`
      );
      if (listItem) {
        listItem.className = "threat-status status-notified";
        listItem.textContent = "Notified";
      }
    } else {
      notifyRangerBtn.disabled = false;
      notifyRangerBtn.innerHTML =
        '<i class="fas fa-exclamation-circle"></i> Failed - Try Again';
      console.error("Notification failed:", data.message);
    }
  } catch (error) {
    notifyRangerBtn.disabled = false;
    notifyRangerBtn.innerHTML =
      '<i class="fas fa-exclamation-circle"></i> Error - Try Again';
    console.error("Error sending notification:", error);
  }
}
