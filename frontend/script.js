class WeaponDetectionDashboard {
  constructor() {
    this.isDetecting = false;
    this.videoStream = null;
    this.detections = [];
    this.fileQueue = [];
    this.systemStats = {
      detectionsToday: 0,
      activeCameras: 3,
      uptime: "99.7%",
      storageUsed: "0KB",
      totalImagesProcessed: 0,
      totalVideosProcessed: 0,
      lastUpdate: ""
    };
    this.settings = {
      confidenceThreshold: 0.8,
      autoDismissTime: 8000
    };
    this.currentPage = 1;
    this.itemsPerPage = 10;
    this.filterBy = "all";
    this.sortBy = "timestamp";
    this.sortOrder = "desc";
    
    this.currentDetectionAlert = null; 

    this.API_BASE_URL = "http://localhost:5000/api";
    this.UPLOAD_FILE_URL = `${this.API_BASE_URL}/upload/file`;
    this.LIVE_DETECT_URL = `${this.API_BASE_URL}/live/detect`;
    this.DETECTIONS_URL = `${this.API_BASE_URL}/detections`;
    this.CLEAR_DATA_URL = `${this.API_BASE_URL}/detections/clear`; // NEW

    this.videoElement = document.getElementById("videoElement");
    this.boundingBoxEl = document.getElementById("boundingBox");
    this.videoPlaceholderEl = document.getElementById("videoPlaceholder");
    this.detectionStatusEl = document.getElementById("detectionStatus");

    this.init();
  }

  init() {
    this.bindEventListeners();
    this.fetchDetectionLogs();
    this.updateUI();

    document.getElementById("startDetection").style.display = "inline-block";
    document.getElementById("stopDetection").style.display = "none";

    if (this.videoPlaceholderEl) this.videoPlaceholderEl.style.display = "flex";
    if (this.videoElement) this.videoElement.style.display = "none";
    
    this.startTimeUpdates();
    
    console.log("Enhanced Weapon Vision AI Dashboard initialized");
  }

  bindEventListeners() {
    this.bindElement("startDetection", "click", () => this.startDetection());
    this.bindElement("stopDetection", "click", () => this.stopDetection());
    this.bindElement("dismissAlert", "click", e => {
      e.preventDefault();
      e.stopPropagation();
      this.dismissAlert(true);
    });

    this.bindElement("settingsBtn", "click", () => this.openSettingsModal());
    this.bindElement("closeModal", "click", () => this.closeSettingsModal());
    this.bindElement("cancelSettings", "click", () => this.closeSettingsModal());
    this.bindElement("modalBackdrop", "click", () => this.closeSettingsModal());
    this.bindElement("saveSettings", "click", () => this.saveSettings());
    this.bindElement("clearAllData", "click", () => this.clearDetectionData()); // NEW: Delete History

    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", e => this.switchTab(e.target.dataset.tab));
    });

    this.bindElement("uploadArea", "click", () => document.getElementById("fileInput").click());
    this.bindElement("browseBtn", "click", () => document.getElementById("fileInput").click());
    this.bindElement("fileInput", "change", e => this.handleFileSelect(e));
    this.bindElement("processFiles", "click", () => this.processFiles());
    this.bindElement("clearQueue", "click", () => this.clearFileQueue());

    const uploadArea = document.getElementById("uploadArea");
    if (uploadArea) {
      uploadArea.addEventListener("dragover", this.handleDragOver.bind(this));
      uploadArea.addEventListener("dragleave", this.handleDragLeave.bind(this));
      uploadArea.addEventListener("drop", this.handleDrop.bind(this));
    }

    this.bindElement("confidenceThreshold", "input", e => {
      const value = Math.round(e.target.value * 100);
      document.getElementById("confidenceValue").textContent = `${value}%`;
      this.settings.confidenceThreshold = parseFloat(e.target.value); 
    });

    this.bindElement("sourceFilter", "change", e => {
      this.filterBy = e.target.value;
      this.currentPage = 1;
      this.updateDetectionTable();
    });

    this.bindElement("sortBy", "change", e => {
      this.sortBy = e.target.value;
      this.updateDetectionTable();
    });

    this.bindElement("prevPage", "click", () => this.previousPage());
    this.bindElement("nextPage", "click", () => this.nextPage());
  }

  // NEW: Delete History Function
  async clearDetectionData() {
    if (!confirm("WARNING: Are you sure you want to delete ALL detection history and log files? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(this.CLEAR_DATA_URL, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(data.message);
      
      // Reset frontend state
      this.detections = [];
      this.systemStats.detectionsToday = 0;
      this.systemStats.storageUsed = this.estimateStorageUsed();
      this.updateUI();
      this.closeSettingsModal();
      alert("Detection history and log files successfully cleared.");

    } catch (error) {
      console.error("Failed to clear detection data:", error);
      alert("Error: Failed to clear detection data. Check the console for details.");
    }
  }

  bindElement(id, event, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener(event, handler);
    }
  }

  openSettingsModal() {
    const modal = document.getElementById("settingsModal");
    if (!modal) return;
    
    const thresholdInput = document.getElementById("confidenceThreshold");
    const dismissSelect = document.getElementById("autoDismiss");
    
    if (thresholdInput) thresholdInput.value = this.settings.confidenceThreshold;
    document.getElementById("confidenceValue").textContent = `${Math.round(this.settings.confidenceThreshold * 100)}%`;
    if (dismissSelect) dismissSelect.value = (this.settings.autoDismissTime / 1000).toString();

    modal.classList.remove("hidden");
  }

  closeSettingsModal() {
    document.getElementById("settingsModal").classList.add("hidden");
  }

  saveSettings() {
    const threshold = document.getElementById("confidenceThreshold").value;
    const autoDismiss = document.getElementById("autoDismiss").value;

    this.settings.confidenceThreshold = parseFloat(threshold);
    this.settings.autoDismissTime = parseInt(autoDismiss) * 1000;

    this.closeSettingsModal();
    console.log("Settings saved:", this.settings);
  }

  switchTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add("active");

    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
    const tabContent = document.getElementById(`${tabName}-tab`);
    if (tabContent) {
      tabContent.classList.add("active");
    }
  }

  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    this.addFilesToQueue(files);
    e.target.value = ''; 
  }

  handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add("drag-over");
  }

  handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
  }

  handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    const files = Array.from(event.dataTransfer.files);
    this.addFilesToQueue(files);
  }

  addFilesToQueue(files) {
    const validFiles = files.filter(file => this.isValidFile(file));
    validFiles.forEach(file => {
      if (!this.fileQueue.find(qFile => qFile.name === file.name && qFile.size === file.size)) {
        this.fileQueue.push(file);
      }
    });
    if (validFiles.length > 0) {
      this.updateFileQueue();
      this.showFileQueue();
    }
    if (validFiles.length < files.length) {
      this.showAlert(
        "Invalid Files",
        "Some files were skipped. Only PNG, JPG, JPEG, MP4, AVI, MOV, and WEBM files are supported and must be under 50MB."
      );
    }
  }

  isValidFile(file) {
    const supportedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "video/mp4",
      "video/avi",
      "video/mov",
      "video/webm"
    ];
    // Check type by MIME type and also file extension as fallback (since backend checks extension)
    const isSupportedType = supportedTypes.includes(file.type) || 
                           file.name.toLowerCase().match(/\.(mp4|avi|mov|webm|png|jpe?g)$/);
                           
    return isSupportedType && file.size <= 50000000;
  }

  updateFileQueue() {
    const queueList = document.getElementById("queueList");
    if (!queueList) return;
    queueList.innerHTML = "";
    this.fileQueue.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "queue-item";
      item.innerHTML = `
            <div class="file-icon">${file.type.startsWith("image/") ? "🖼️" : "🎬"}</div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${this.formatFileSize(file.size)}</div>
            </div>
            <button class="remove-file" data-index="${index}">×</button>
          `;
      const removeBtn = item.querySelector(".remove-file");
      removeBtn.addEventListener("click", () => this.removeFileFromQueue(index));
      queueList.appendChild(item);
    });
    const processBtn = document.getElementById("processFiles");
    const clearBtn = document.getElementById("clearQueue");
    if (processBtn && clearBtn) {
        processBtn.disabled = this.fileQueue.length === 0;
        clearBtn.disabled = this.fileQueue.length === 0;
    }
  }

  showFileQueue() {
    const fileQueue = document.getElementById("fileQueue");
    if (fileQueue) {
      fileQueue.classList.remove("hidden");
    }
  }

  removeFileFromQueue(index) {
    this.fileQueue.splice(index, 1);
    this.updateFileQueue();
    if (this.fileQueue.length === 0) {
      document.getElementById("fileQueue").classList.add("hidden");
    }
  }

  clearFileQueue() {
    this.fileQueue = [];
    document.getElementById("fileQueue").classList.add("hidden");
    this.updateFileQueue();
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  async processFiles() {
    if (this.fileQueue.length === 0) return;
    const filesToProcess = [...this.fileQueue]; 
    this.clearFileQueue(); 

    const progressContainer = document.getElementById("analysisProgress");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    const currentFileEl = document.getElementById("currentFile");


    progressContainer.classList.remove("hidden");
    const totalFiles = filesToProcess.length;


    for (let i = 0; i < totalFiles; i++) {
      const file = filesToProcess[i];
      const progress = (i / totalFiles) * 100;
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `${i}/${totalFiles} files processed`;
      currentFileEl.textContent = `Uploading and analyzing: ${file.name}`;


      const formData = new FormData();
      formData.append("file", file);


      try {
        const response = await fetch(this.UPLOAD_FILE_URL, {
          method: "POST",
          body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();


        if (data.results) {
          data.results.forEach(det => {
            // FIX: Pass thumbnail_url and annotated_log_url from the response
            this.addDetectionToLog(
              det.weapon_type,
              det.confidence,
              det.source || (file.type.startsWith("image/") ? "Image" : "Video"),
              file.name,
              det.thumbnail_url || null,
              det.annotated_log_url || null 
            );


            if (det.confidence > this.settings.confidenceThreshold) {
              this.showAlert(det.weapon_type, det.confidence, file.name);
            }
          });
        } else if (data.message) {
          console.log(`Server message for ${file.name}:`, data.message);
        }
      } catch (error) {
        console.error("Upload/Detection error for file:", file.name, error);
        this.showAlert(
          "Analysis Failed",
          0,
          `Error processing ${file.name}. See console for details.`
        );
      }


      if (file.type.startsWith("image/")) {
        this.systemStats.totalImagesProcessed++;
      } else {
        this.systemStats.totalVideosProcessed++;
      }
    }


    progressFill.style.width = "100%";
    progressText.textContent = `${totalFiles}/${totalFiles} files processed`;
    currentFileEl.textContent = "Analysis complete!";


    this.updateStatsDisplay();
    this.fetchDetectionLogs(); // Refresh log table


    setTimeout(() => {
      progressContainer.classList.add("hidden");
    }, 2000);
  }

  async fetchDetectionLogs() {
    try {
      const response = await fetch(this.DETECTIONS_URL);
      if (!response.ok) {
        console.error("Failed to fetch logs, using mock data. Status:", response.status);
        return;
      }
      const detections = await response.json();
      this.detections = detections.map(d => ({
        id: d.id,
        timestamp: d.timestamp,
        weaponType: d.weapon_type,
        confidence: d.confidence,
        status: d.status,
        source: d.source.charAt(0).toUpperCase() + d.source.slice(1), 
        thumbnail: d.thumbnail_url,
        fileName: d.file_path ? d.file_path.split(/\/|\\/).pop() : null,
        annotatedUrl: d.annotated_log_url 
      }));
      this.systemStats.totalImagesProcessed = this.detections.filter(d => d.source === "Image").length;
      this.systemStats.totalVideosProcessed = this.detections.filter(d => d.source === "Video").length;
      this.systemStats.detectionsToday = this.detections.length;
      this.systemStats.storageUsed = this.estimateStorageUsed(); 
      this.updateDetectionTable();
      this.updateStatsDisplay();
    } catch (error) {
      console.error("Failed to fetch detection logs:", error);
    }
  }

  showAlert(weaponType, confidence, fileName = null) {
    const alertBanner = document.getElementById("alertBanner");
    const alertTimestamp = document.getElementById("alertTimestamp");
    
    // Only show the high-priority alert if the confidence is met
    if (confidence < this.settings.confidenceThreshold && fileName !== "Live Cam") return; 

    // Override the alert only if the incoming alert is of higher confidence or a new type,
    // or if the current one is low confidence
    if (this.currentDetectionAlert) {
         if (fileName === "Live Cam" && this.currentDetectionAlert.fileName === "Live Cam" && this.currentDetectionAlert.confidence > confidence) {
             return; // Don't replace a high-conf live alert with a lower-conf one
         }
    }


    this.currentDetectionAlert = { weaponType, confidence, fileName };

    if (alertBanner && alertTimestamp) {
      const timestamp = this.getCurrentTime();
      let message = `${weaponType} detected at ${timestamp}`;
      message += ` (${(confidence * 100).toFixed(1)}% confidence)`;

      if (fileName && fileName !== "Live Cam") {
        message += ` in ${fileName}`;
      } else if (fileName === "Live Cam") {
        message += ` on Live Camera Feed`;
      }

      alertTimestamp.textContent = message;
      alertBanner.classList.remove("hidden", "fade-out");
      alertBanner.classList.add("fade-in");

      clearTimeout(this.alertTimeout);

      if (fileName !== "Live Cam" && this.settings.autoDismissTime > 0) { 
        this.alertTimeout = setTimeout(() => {
          this.dismissAlert(false);
        }, this.settings.autoDismissTime);
      }
    }
  }

  dismissAlert(isManualDismiss = false) {
    // CRITICAL FIX: Only auto-dismiss live cam alerts or manually dismissed alerts.
    // Prevent bounding box disappearance from auto-dismissing file alerts.
    if (!isManualDismiss && this.currentDetectionAlert && this.currentDetectionAlert.fileName !== "Live Cam") {
        return; 
    }
    
    if (this.currentDetectionAlert === null && !isManualDismiss) return;
    
    this.currentDetectionAlert = null;
    
    const alertBanner = document.getElementById("alertBanner");
    if (alertBanner && !alertBanner.classList.contains("hidden")) {
      alertBanner.classList.remove("fade-in");
      alertBanner.classList.add("fade-out");
      
      clearTimeout(this.alertTimeout); 

      setTimeout(() => {
        alertBanner.classList.add("hidden");
        alertBanner.classList.remove("fade-out");
      }, 300); 
    }
  }

  addDetectionToLog(weaponType, confidence, source, fileName = null, thumbnail = null, annotatedUrl = null) {
    const timestamp = this.getCurrentDateTime();
    const newDetection = {
      id: Date.now() + Math.random(),
      timestamp: timestamp,
      weaponType: weaponType,
      confidence: confidence,
      status: confidence > this.settings.confidenceThreshold ? "Verified" : "Under Review",
      source: source,
      fileName: fileName,
      thumbnail: thumbnail,
      annotatedUrl: annotatedUrl 
    };
    this.detections.unshift(newDetection);
    this.systemStats.storageUsed = this.estimateStorageUsed();
    this.systemStats.detectionsToday++; 
    this.updateDetectionTable();
    this.updateStatsDisplay(); 
  }

  estimateStorageUsed() {
    const avgDetectionSize = 500;
    const totalSize = this.detections.length * avgDetectionSize;
    return this.formatFileSize(totalSize);
  }

  getFilteredAndSortedDetections() {
    let filtered = this.detections;
    if (this.filterBy !== "all") {
      filtered = filtered.filter(detection => detection.source === this.filterBy);
    }
    filtered.sort((a, b) => {
      let valueA = a[this.sortBy];
      let valueB = b[this.sortBy];
      if (this.sortBy === "timestamp") {
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      } else if (this.sortBy === "confidence") {
        valueA = parseFloat(a.confidence);
        valueB = parseFloat(b.confidence);
      }
      
      let comparison = 0;
      if (valueA > valueB) {
          comparison = 1;
      } else if (valueA < valueB) {
          comparison = -1;
      }

      return this.sortOrder === "desc" ? comparison * -1 : comparison;
    });
    return filtered;
  }

  updateDetectionTable() {
    const tableBody = document.getElementById("detectionTableBody");
    if (!tableBody) return;
    const filteredDetections = this.getFilteredAndSortedDetections();
    const totalPages = Math.ceil(filteredDetections.length / this.itemsPerPage);
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const pageDetections = filteredDetections.slice(startIndex, endIndex);
    tableBody.innerHTML = "";
    
    if (pageDetections.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No detections found.</td></tr>`;
    }

    pageDetections.forEach(detection => {
      const row = document.createElement("tr");
      
      // Handle Thumbnail/Preview cell with potential link to annotated image
      let thumbnailCellContent = "";
      if (detection.thumbnail) {
        thumbnailCellContent = `<img src="${detection.thumbnail}" alt="Detection thumbnail" class="thumbnail">`;
      } else {
        const icon =
          detection.source === "Live" ? "📹" : detection.source === "Image" ? "🖼️" : "🎬";
        thumbnailCellContent = `<div class="thumbnail-placeholder">${icon}</div>`;
      }

      let previewCell;
      if (detection.annotatedUrl) {
          previewCell = `<td><a href="${detection.annotatedUrl}" target="_blank" title="View Full Annotated Log">${thumbnailCellContent}</a></td>`;
      } else {
          previewCell = `<td>${thumbnailCellContent}</td>`;
      }

      row.innerHTML = `
                ${previewCell}
                <td>${detection.timestamp}</td>
                <td><span class="source-badge ${detection.source.toLowerCase()}">${detection.source}</span></td>
                <td>${detection.weaponType}</td>
                <td class="confidence-score">${(detection.confidence * 100).toFixed(1)}%</td>
                <td>
                    <span class="status-badge ${detection.status.toLowerCase().replace(/\s+/g, "-")}">
                        ${detection.status}
                    </span>
                </td>
            `;
      tableBody.appendChild(row);
    });
    this.updatePagination(totalPages, filteredDetections.length);
  }

  updatePagination(totalPages, totalItems) {
    const pageInfo = document.getElementById("pageInfo");
    const prevBtn = document.getElementById("prevPage");
    const nextBtn = document.getElementById("nextPage");
    
    this.currentPage = Math.max(1, this.currentPage); 
    totalPages = Math.max(1, totalPages); 

    if (pageInfo) {
      pageInfo.textContent = `Page ${this.currentPage} of ${totalPages} (${totalItems} total)`;
    }
    if (prevBtn) {
      prevBtn.disabled = this.currentPage <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= totalPages;
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updateDetectionTable();
    }
  }

  nextPage() {
    const filteredDetections = this.getFilteredAndSortedDetections();
    const totalPages = Math.ceil(filteredDetections.length / this.itemsPerPage);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.updateDetectionTable();
    }
  }

  updateStatsDisplay() {
    const elements = {
      detectionsToday: this.systemStats.detectionsToday,
      activeCameras: this.systemStats.activeCameras,
      systemUptime: this.systemStats.uptime,
      storageUsed: this.systemStats.storageUsed
    };
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
        if (id === "detectionsToday") {
          element.closest(".stat-card").classList.add("pulse-effect");
          setTimeout(() => {
            element.closest(".stat-card").classList.remove("pulse-effect");
          }, 500);
        }
      }
    });
  }


  updateLastUpdateTime() {
    const lastUpdateElement = document.getElementById("lastUpdate");
    if (lastUpdateElement) {
      this.systemStats.lastUpdate = this.getCurrentTime();
      lastUpdateElement.textContent = this.systemStats.lastUpdate;
    }
  }


  updateUI() {
    this.updateDetectionTable();
    this.updateStatsDisplay();
    this.updateLastUpdateTime();
  }


  startTimeUpdates() {
    setInterval(() => {
      if (!this.isDetecting) {
        this.systemStats.lastUpdate = this.getCurrentTime();
        this.updateLastUpdateTime();
      }
    }, 30000); 
    this.systemStats.lastUpdate = this.getCurrentTime();
    this.updateLastUpdateTime();
  }


  getCurrentTime() {
    return new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }


  getCurrentDateTime() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    return `${date} ${time}`;
  }


  async startDetection() {
    if (this.isDetecting) return;
    try {
      console.log("Requesting webcam access...");
      this.videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!this.videoElement) {
        console.error("Video element not found");
        return;
      }
      
      if (this.videoPlaceholderEl) this.videoPlaceholderEl.style.display = "none";
      this.videoElement.style.display = "block";
      
      this.videoElement.srcObject = this.videoStream;
      await new Promise(resolve => this.videoElement.onloadedmetadata = resolve);
      await this.videoElement.play();
      this.isDetecting = true;
      
      document.getElementById("startDetection").style.display = "none";
      document.getElementById("stopDetection").style.display = "inline-block";
      
      if (this.detectionStatusEl) {
          this.detectionStatusEl.querySelector(".status-indicator").classList.remove("inactive");
          this.detectionStatusEl.querySelector(".status-indicator").classList.add("active");
          this.detectionStatusEl.querySelector("span").textContent = "Detection Active";
      }

      this.processVideoFrames();
      console.log("Webcam started for detection");
    } catch (err) {
      console.error("Webcam access error:", err);
      if (this.currentDetectionAlert === null) {
          alert("Could not access webcam: " + err.message);
      }
      this.stopDetection(true); 
    }
  }

  stopDetection(isError = false) {
    if (!this.isDetecting && !isError) return; 
    
    this.isDetecting = false;
    
    this.updateBoundingBox(null); 
    
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.style.display = "none";
    }

    if (this.videoPlaceholderEl) this.videoPlaceholderEl.style.display = "flex";

    document.getElementById("startDetection").style.display = "inline-block";
    document.getElementById("stopDetection").style.display = "none";
    
    if (this.detectionStatusEl) {
        this.detectionStatusEl.querySelector(".status-indicator").classList.remove("active");
        this.detectionStatusEl.querySelector(".status-indicator").classList.add("inactive");
        this.detectionStatusEl.querySelector("span").textContent = isError ? "Detection Inactive (Error)" : "Detection Inactive";
    }

    this.dismissAlert(true);
  }

  updateBoundingBox(detection) {
    if (!this.boundingBoxEl) return;

    if (detection && detection.box) {
        const [x_min, y_min, x_max, y_max] = detection.box;
        
        if (!x_min || !y_min || !x_max || !y_max || x_min > x_max || y_min > y_max) {
             console.warn("Invalid bounding box data received:", detection.box);
             this.boundingBoxEl.classList.add("hidden");
             return;
        }

        const videoWidth = this.videoElement.offsetWidth;
        const videoHeight = this.videoElement.offsetHeight;
        
        const left = x_min * videoWidth;
        const top = y_min * videoHeight;
        const width = (x_max - x_min) * videoWidth;
        const height = (y_max - y_min) * videoHeight;
        
        this.boundingBoxEl.style.left = `${left}px`;
        this.boundingBoxEl.style.top = `${top}px`;
        this.boundingBoxEl.style.width = `${width}px`;
        this.boundingBoxEl.style.height = `${height}px`;
        
        const confidencePercent = (detection.confidence * 100).toFixed(1);
        
        const isHighConfidence = detection.confidence >= this.settings.confidenceThreshold;
        const boxColor = isHighConfidence ? "var(--color-danger)" : "var(--color-warning)";
        const boxBg = isHighConfidence ? "rgba(var(--color-red-400-rgb), 0.1)" : "rgba(var(--color-orange-400-rgb), 0.1)";

        this.boundingBoxEl.innerHTML = `
            <div class="box-label" style="background-color: ${boxColor};">
                ${detection.weapon_type} (${confidencePercent}%)
            </div>
        `;
        
        this.boundingBoxEl.classList.remove("hidden");
        this.boundingBoxEl.style.borderColor = boxColor;
        this.boundingBoxEl.style.backgroundColor = boxBg;

    } else {
        this.boundingBoxEl.classList.add("hidden");
        this.boundingBoxEl.innerHTML = '';
        
        if (this.currentDetectionAlert && this.currentDetectionAlert.fileName === "Live Cam") {
            this.dismissAlert(false);
        }
    }
  }

  async processVideoFrames() {
    if (!this.isDetecting || !this.videoElement) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const intervalMs = 1000; 

    const detectFrame = async () => {
      if (!this.isDetecting) {
        this.updateBoundingBox(null);
        return;
      }
      
      try {
        if (this.videoElement.readyState < 2 || this.videoElement.videoWidth === 0) {
            setTimeout(detectFrame, 500); 
            return;
        }
        
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

        let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8)); 
        if (!blob) {
          setTimeout(detectFrame, intervalMs);
          return;
        }

        const formData = new FormData();
        formData.append("file", blob, "webcam.jpg");
        formData.append("confidence_threshold", this.settings.confidenceThreshold); 

        const response = await fetch(this.LIVE_DETECT_URL, { 
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
            console.error("Detection API response not ok. Status:", response.status);
            this.updateBoundingBox(null); 
            setTimeout(detectFrame, intervalMs);
            return;
        }

        const data = await response.json();
        
        const highConfDetection = data.results && data.results.length > 0
            ? data.results.reduce((max, det) => det.confidence > max.confidence ? det : max, data.results[0])
            : null;
        
        if (highConfDetection) {
            this.updateBoundingBox(highConfDetection);

            const isAboveThreshold = highConfDetection.confidence >= this.settings.confidenceThreshold;

            if (isAboveThreshold) {
                // If the object is present and we don't have an alert active, show it.
                if (this.currentDetectionAlert === null || this.currentDetectionAlert.fileName !== "Live Cam" || this.currentDetectionAlert.confidence < this.settings.confidenceThreshold) {
                    this.showAlert(highConfDetection.weapon_type, highConfDetection.confidence, "Live Cam");
                }
            } else {
                 // If detection is below threshold:
                 // Clear any HIGH-CONFIDENCE live alert.
                 if (this.currentDetectionAlert && this.currentDetectionAlert.fileName === "Live Cam" && this.currentDetectionAlert.confidence >= this.settings.confidenceThreshold) {
                      this.dismissAlert(false);
                 }
            }
        } else {
             this.updateBoundingBox(null);
             // If no detection is found, dismiss any active live cam alert.
             if (this.currentDetectionAlert && this.currentDetectionAlert.fileName === "Live Cam") {
                 this.dismissAlert(false);
             }
        }
        
        this.fetchDetectionLogs();

      } catch (err) {
        console.error("Error during detection frame processing:", err);
        this.updateBoundingBox(null);
      }

      setTimeout(detectFrame, intervalMs);
    };

    detectFrame();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.dashboard = new WeaponDetectionDashboard();
  console.log("Weapon Detection Dashboard loaded.");
});