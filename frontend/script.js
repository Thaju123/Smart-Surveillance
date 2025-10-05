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

    this.API_BASE_URL = "http://localhost:5000/api";
    this.UPLOAD_FILE_URL = `${this.API_BASE_URL}/upload/file`;
    this.DETECTIONS_URL = `${this.API_BASE_URL}/detections`;

    this.videoElement = document.getElementById("videoElement");

    this.init();
  }

  init() {
    this.bindEventListeners();
    this.fetchDetectionLogs();
    this.updateUI();

    document.getElementById("startDetection").style.display = "inline-block";
    document.getElementById("stopDetection").style.display = "none";

    this.startTimeUpdates();
    console.log("Enhanced Weapon Vision AI Dashboard initialized");
  }

  bindEventListeners() {
    this.bindElement("startDetection", "click", () => this.startDetection());
    this.bindElement("stopDetection", "click", () => this.stopDetection());
    this.bindElement("dismissAlert", "click", e => {
      e.preventDefault();
      e.stopPropagation();
      this.dismissAlert();
    });

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
      this.settings.confidenceThreshold = e.target.value;
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

  bindElement(id, event, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener(event, handler);
    }
  }

  switchTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
    const tabContent = document.getElementById(`${tabName}-tab`);
    if (tabContent) {
      tabContent.classList.add("active");
    }
  }

  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    this.addFilesToQueue(files);
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
      if (!this.fileQueue.find(qFile => qFile.name === file.name)) {
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
        "Some files were skipped. Only PNG, JPG, JPEG, MP4, AVI, MOV, and WEBM files are supported."
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
    return supportedTypes.includes(file.type) && file.size <= 50000000; // 50MB limit
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
    const progressContainer = document.getElementById("analysisProgress");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    const currentFileEl = document.getElementById("currentFile");


    progressContainer.classList.remove("hidden");
    const totalFiles = this.fileQueue.length;


    for (let i = 0; i < totalFiles; i++) {
      const file = this.fileQueue[i];
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
        const data = await response.json();


        if (data.results) {
          data.results.forEach(det => {
            this.addDetectionToLog(
              det.weapon_type,
              det.confidence,
              det.source || (file.type.startsWith("image/") ? "Image" : "Video"),
              file.name,
              det.thumbnail_url || null
            );


            if (det.confidence > this.settings.confidenceThreshold) {
              this.showAlert(det.weapon_type, det.confidence, file.name);
            }
          });
        } else if (data.message) {
          console.log(data.message);
        }
      } catch (error) {
        console.error("Upload/Detection error:", error);
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
    this.updateDetectionTable();


    setTimeout(() => {
      progressContainer.classList.add("hidden");
      this.clearFileQueue();
    }, 2000);
  }

  async fetchDetectionLogs() {
    try {
      const response = await fetch(this.DETECTIONS_URL);
      const detections = await response.json();
      this.detections = detections.map(d => ({
        id: d.id,
        timestamp: d.timestamp,
        weaponType: d.weapon_type,
        confidence: d.confidence,
        status: d.status,
        source: d.source,
        thumbnail: d.thumbnail_url,
        fileName: d.file_path ? d.file_path.split("/").pop() : null
      }));
      this.systemStats.totalImagesProcessed = this.detections.filter(d => d.source === "Image").length;
      this.systemStats.totalVideosProcessed = this.detections.filter(d => d.source === "Video").length;
      this.systemStats.detectionsToday = this.detections.length;
      this.updateDetectionTable();
      this.updateStatsDisplay();
    } catch (error) {
      console.error("Failed to fetch detection logs:", error);
    }
  }

  showAlert(weaponType, confidence, fileName = null) {
    const alertBanner = document.getElementById("alertBanner");
    const alertTimestamp = document.getElementById("alertTimestamp");
    if (alertBanner && alertTimestamp) {
      const timestamp = this.getCurrentTime();
      let message = `${weaponType} detected at ${timestamp} (${(confidence * 100).toFixed(1)}% confidence)`;
      if (fileName) {
        message += ` in ${fileName}`;
      }
      alertTimestamp.textContent = message;
      alertBanner.classList.remove("hidden", "fade-out");
      alertBanner.classList.add("fade-in");
      if (this.settings.autoDismissTime > 0) {
        setTimeout(() => {
          this.dismissAlert();
        }, this.settings.autoDismissTime);
      }
    }
  }


  dismissAlert() {
    const alertBanner = document.getElementById("alertBanner");
    if (alertBanner && !alertBanner.classList.contains("hidden")) {
      alertBanner.classList.remove("fade-in");
      alertBanner.classList.add("fade-out");
      setTimeout(() => {
        alertBanner.classList.add("hidden");
        alertBanner.classList.remove("fade-out");
      }, 300);
    }
  }


  addDetectionToLog(weaponType, confidence, source, fileName = null, thumbnail = null) {
    const timestamp = this.getCurrentDateTime();
    const newDetection = {
      id: Date.now() + Math.random(),
      timestamp: timestamp,
      weaponType: weaponType,
      confidence: confidence,
      status: confidence > this.settings.confidenceThreshold ? "Verified" : "Under Review",
      source: source,
      fileName: fileName,
      thumbnail: thumbnail
    };
    this.detections.unshift(newDetection);
    this.systemStats.storageUsed = this.estimateStorageUsed();
    this.updateDetectionTable();
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
        valueA = parseFloat(valueA);
        valueB = parseFloat(valueB);
      }
      if (this.sortOrder === "desc") {
        return valueA > valueB ? -1 : 1;
      } else {
        return valueA < valueB ? -1 : 1;
      }
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
    pageDetections.forEach(detection => {
      const row = document.createElement("tr");
      let thumbnailCell = "";
      if (detection.thumbnail) {
        thumbnailCell = `<img src="${detection.thumbnail}" alt="Detection thumbnail" class="thumbnail">`;
      } else {
        const icon =
          detection.source === "Live" ? "📹" : detection.source === "Image" ? "🖼️" : "🎬";
        thumbnailCell = `<div class="thumbnail-placeholder">${icon}</div>`;
      }
      row.innerHTML = `
                <td>${thumbnailCell}</td>
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
    if (pageInfo) {
      pageInfo.textContent = `Page ${this.currentPage} of ${totalPages} (${totalItems} total)`;
    }
    if (prevBtn) {
      prevBtn.disabled = this.currentPage === 1;
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
          element.parentElement.style.transform = "scale(1.05)";
          setTimeout(() => {
            element.parentElement.style.transform = "scale(1)";
          }, 200);
        }
      }
    });
  }


  updateLastUpdateTime() {
    const lastUpdateElement = document.getElementById("lastUpdate");
    if (lastUpdateElement) {
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
      this.videoElement.srcObject = this.videoStream;
      await this.videoElement.play();
      this.isDetecting = true;

      document.getElementById("startDetection").style.display = "none";
      document.getElementById("stopDetection").style.display = "inline-block";

      this.processVideoFrames();
      console.log("Webcam started for detection");
    } catch (err) {
      alert("Could not access webcam: " + err.message);
      console.error("Webcam access error:", err);
    }
  }


  stopDetection() {
    if (!this.isDetecting) return;
    this.isDetecting = false;
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
    }

    document.getElementById("startDetection").style.display = "inline-block";
    document.getElementById("stopDetection").style.display = "none";

    this.dismissAlert();
  }


  dismissAlert() {
    const alertBanner = document.getElementById("alertBanner");
    if (alertBanner && !alertBanner.classList.contains("hidden")) {
      alertBanner.classList.remove("fade-in");
      alertBanner.classList.add("fade-out");
      setTimeout(() => {
        alertBanner.classList.add("hidden");
        alertBanner.classList.remove("fade-out");
      }, 300);
    }
  }


    async processVideoFrames() {
    if (!this.isDetecting || !this.videoElement) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const intervalMs = 1000;

    const detectFrame = async () => {
      if (!this.isDetecting) {
        console.log("Detection stopped.");
        return;
      }

      try {
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

        let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg"));
        if (!blob) {
          console.warn("Failed to get blob from canvas.");
          setTimeout(detectFrame, intervalMs);
          return;
        }

        const formData = new FormData();
        formData.append("file", blob, "webcam.jpg");

        const response = await fetch(this.UPLOAD_FILE_URL, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          console.error("Detection API response not ok:", response.status);
          setTimeout(detectFrame, intervalMs);
          return;
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
          const highConf = data.results.find(r => r.confidence >= this.settings.confidenceThreshold);
          if (highConf) this.showAlert(highConf.weapon_type, highConf.confidence, "Live Cam");
          data.results.forEach(r => this.addDetectionToLog(r.weapon_type, r.confidence, "Live", null, r.thumbnail_url));
        }
      } catch (err) {
        console.error("Error during detection frame processing:", err);
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
