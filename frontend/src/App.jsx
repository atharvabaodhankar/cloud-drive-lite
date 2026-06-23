import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  File,
  FileText,
  FileArchive,
  Image,
  Video,
  Music,
  Trash2,
  Copy,
  Check,
  Search,
  RefreshCw,
  Shield,
  HardDrive,
  ExternalLink,
  AlertTriangle,
  Download,
  CheckCircle2,
  XCircle,
  X,
  Lock,
  LockKeyhole,
  Activity,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import confetti from 'canvas-confetti';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  // States
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, largest, smallest
  const [fileTypeFilter, setFileTypeFilter] = useState('all'); // all, image, document, archive, media, other
  const [toasts, setToasts] = useState([]);
  const [deletingKeys, setDeletingKeys] = useState({});

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Helper for adding toast alerts
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Check connection to server and load files
  const checkConnectionAndLoad = async () => {
    try {
      const response = await fetch(`${API_URL}/`);
      if (response.ok) {
        setIsConnected(true);
        loadFiles();
      } else {
        setIsConnected(false);
        setLoading(false);
      }
    } catch (err) {
      setIsConnected(false);
      setLoading(false);
      showToast('Could not connect to the backend server.', 'error');
    }
  };

  // Fetch files from backend
  const loadFiles = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/files`);
      const data = await response.json();
      if (data.success) {
        setFiles(data.files);
      } else {
        showToast(data.error || 'Failed to load files.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error fetching file list.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnectionAndLoad();
  }, []);

  // Upload file using XMLHttpRequest for progress tracking
  const uploadFile = (file) => {
    if (file.size > 26214400) {
      showToast('File exceeds the 25MB limit.', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadFileName(file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/upload`, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success) {
            showToast('File uploaded and secured successfully.', 'success');
            // Trigger confetti for premium micro-interaction
            confetti({
              particleCount: 80,
              spread: 60,
              origin: { y: 0.8 },
              colors: ['#ffffff', '#a1a1aa', '#3f3f46', '#27272a']
            });
            loadFiles();
          } else {
            showToast(res.error || 'Upload failed.', 'error');
          }
        } catch (e) {
          showToast('Invalid server response.', 'error');
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          showToast(res.error || 'Upload failed.', 'error');
        } catch (e) {
          showToast(`Server returned status code ${xhr.status}`, 'error');
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      showToast('Network error during upload.', 'error');
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  };

  // Handle file drop/input
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      uploadFile(selectedFile);
    }
  };

  // Drag and drop event handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  // Securely delete file
  const deleteFile = async (key) => {
    setDeletingKeys((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`${API_URL}/files/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        showToast('File deleted securely.', 'success');
        // Instantly filter out file in UI state
        setFiles((prev) => prev.filter((file) => file.key !== key));
      } else {
        showToast(data.error || 'Deletion failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to delete file.', 'error');
    } finally {
      setDeletingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Copy presigned url to clipboard
  const copyLink = (url, key) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    showToast('Secure presigned link copied (expires in 1hr).', 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Determine file icon
  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const style = "w-6 h-6 text-zinc-400 group-hover:text-white transition-colors duration-300";
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
      return <Image className={style} />;
    }
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) {
      return <Video className={style} />;
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
      return <Music className={style} />;
    }
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
      return <FileArchive className={style} />;
    }
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json'].includes(ext)) {
      return <FileText className={style} />;
    }
    return <File className={style} />;
  };

  // Get file type classification for filters
  const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json'].includes(ext)) return 'document';
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return 'archive';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'media';
    return 'other';
  };

  // Total Storage Size Calculation
  const totalStorageUsed = files.reduce((sum, file) => sum + file.size, 0);
  const storagePercentage = Math.min((totalStorageUsed / 1073741824) * 100, 100); // Percentage of 1GB

  // Filter & Sort files
  const filteredFiles = files
    .filter((file) => {
      const matchesSearch = file.key.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = fileTypeFilter === 'all' || getFileType(file.key) === fileTypeFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.lastModified) - new Date(a.lastModified);
      if (sortBy === 'oldest') return new Date(a.lastModified) - new Date(b.lastModified);
      if (sortBy === 'largest') return b.size - a.size;
      if (sortBy === 'smallest') return a.size - b.size;
      return 0;
    });

  return (
    <div className="min-h-screen monochrome-grid relative flex flex-col font-sans text-zinc-300 selection:bg-white selection:text-black">
      
      {/* Floating Ambient Glow Spots */}
      <motion.div 
        animate={{
          x: [0, 40, -20, 0],
          y: [0, -30, 40, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-zinc-800/10 rounded-full glow-spot pulse-glow"
      />
      <motion.div 
        animate={{
          x: [0, -40, 20, 0],
          y: [0, 50, -30, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-zinc-900/20 rounded-full glow-spot pulse-glow"
      />

      {/* Glassmorphic Toast Container */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.2 } }}
              className={`p-4 rounded-xl glass-panel shadow-2xl flex items-start gap-3 border ${
                toast.type === 'error' ? 'border-red-950/50 bg-red-950/10' : 'border-zinc-800 bg-zinc-950/70'
              }`}
            >
              {toast.type === 'error' ? (
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-sm font-medium text-zinc-200">
                {toast.message}
              </div>
              <button 
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header section */}
      <header className="border-b border-zinc-900 bg-zinc-950/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black font-bold tracking-tight text-lg shadow-glow">
              C
            </div>
            <div>
              <h1 className="text-xl font-semibold font-display tracking-wide text-white m-0 leading-none">
                CLOUD_DRIVE<span className="text-zinc-500 font-light">_LITE</span>
              </h1>
              <p className="text-[10px] text-zinc-500 font-mono tracking-widest mt-1">SECURED COMPACT STORAGE</p>
            </div>
          </div>

          {/* Connection & Security Badge */}
          <div className="flex items-center gap-3">
            <button
              onClick={checkConnectionAndLoad}
              className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all duration-300"
              title="Refresh connection and files"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-white' : ''}`} />
            </button>
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-950 border border-zinc-900 text-xs">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse' : 'bg-red-500'}`} />
              <span className="font-mono text-[11px] text-zinc-400">
                {isConnected ? 'NODE_SECURE_CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Panel - Upload & Analytics (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Glass Storage Stats Widget */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-panel p-6 rounded-2xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-5 h-5 text-zinc-400" />
                <h3 className="font-display font-semibold text-white text-base">Storage Usage</h3>
              </div>
              <span className="text-xs font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                1 GB LIMIT
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-xs font-mono">
                <span className="text-zinc-500">USED</span>
                <span className="text-white font-medium">{formatBytes(totalStorageUsed)}</span>
              </div>
              <div className="h-2 w-full bg-zinc-900/80 rounded-full overflow-hidden border border-zinc-900">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${storagePercentage}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600 font-mono">
                <span>0%</span>
                <span>{storagePercentage.toFixed(2)}%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-900">
              <div>
                <span className="text-[10px] text-zinc-500 font-mono uppercase">Total Files</span>
                <p className="text-2xl font-bold font-display text-white mt-1">{files.length}</p>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-mono uppercase">Remaining</span>
                <p className="text-base font-semibold text-zinc-400 mt-2 font-mono">
                  {formatBytes(Math.max(1073741824 - totalStorageUsed, 0))}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Premium Animated Drag-and-Drop Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            ref={dropZoneRef}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative rounded-2xl glass-panel p-8 flex flex-col items-center justify-center border-2 border-dashed transition-all duration-300 text-center ${
              isDragActive 
                ? 'border-white bg-zinc-900/50 scale-[1.02]' 
                : 'border-zinc-800/80 hover:border-zinc-600 hover:bg-zinc-950/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
            />

            <AnimatePresence mode="wait">
              {uploading ? (
                <motion.div 
                  key="uploading-state"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full py-4 space-y-4"
                >
                  <div className="relative w-12 h-12 mx-auto flex items-center justify-center">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 rounded-full border-2 border-zinc-800 border-t-white"
                    />
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">Uploading Securely...</p>
                    <p className="text-[11px] text-zinc-500 font-mono truncate max-w-[200px] mx-auto">
                      {uploadFileName}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        className="h-full bg-white rounded-full"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                      <span>PROGRESS</span>
                      <span>{uploadProgress}%</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="idle-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer space-y-4 py-4 w-full group"
                >
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto group-hover:bg-white group-hover:text-black group-hover:scale-110 transition-all duration-300">
                    <Upload className="w-5 h-5 text-zinc-400 group-hover:text-black transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
                      Drag & drop file here
                    </p>
                    <p className="text-xs text-zinc-500">
                      or click to explore files
                    </p>
                  </div>
                  <div className="inline-block px-3 py-1 bg-zinc-950 border border-zinc-900 rounded-lg text-[10px] font-mono text-zinc-400 group-hover:border-zinc-700 transition-colors">
                    MAX SIZE 25MB
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Security Features Audit Checklist */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-panel p-6 rounded-2xl flex flex-col gap-4"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-white" />
              <h3 className="font-display font-semibold text-white text-base">Backend Security Audit</h3>
            </div>
            
            <ul className="space-y-3.5 text-xs">
              <li className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">
                  ✓
                </div>
                <div>
                  <p className="font-medium text-zinc-200">Strict CORS Validation</p>
                  <p className="text-[10px] text-zinc-500">Requests restricted to authorized origin</p>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">
                  ✓
                </div>
                <div>
                  <p className="font-medium text-zinc-200">Helmet Secure Headers</p>
                  <p className="text-[10px] text-zinc-500">Protects against common web vulnerabilities</p>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">
                  ✓
                </div>
                <div>
                  <p className="font-medium text-zinc-200">Presigned S3 Access URLs</p>
                  <p className="text-[10px] text-zinc-500">1-hour expiry temporary access keys</p>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">
                  ✓
                </div>
                <div>
                  <p className="font-medium text-zinc-200">IP Rate Limiting Active</p>
                  <p className="text-[10px] text-zinc-500">Defends against brute force & spam API requests</p>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">
                  ✓
                </div>
                <div>
                  <p className="font-medium text-zinc-200">Malware & Key Sanitization</p>
                  <p className="text-[10px] text-zinc-500">Strips path traversals and unsafe S3 names</p>
                </div>
              </li>
            </ul>
          </motion.div>

        </div>

        {/* Right Panel - Files Browser (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Search, Filter & Sort Controls */}
          <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search secured files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-950/80 border border-zinc-900 rounded-xl text-sm focus:outline-none focus:border-zinc-700 placeholder-zinc-600 transition-colors"
              />
            </div>

            {/* Filter and Sort */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              
              {/* Type Filter */}
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-900 px-3 py-1.5 rounded-xl text-xs">
                <Filter className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={fileTypeFilter}
                  onChange={(e) => setFileTypeFilter(e.target.value)}
                  className="bg-transparent text-zinc-300 border-none outline-none font-medium cursor-pointer"
                >
                  <option value="all" className="bg-zinc-950">All Types</option>
                  <option value="image" className="bg-zinc-950">Images</option>
                  <option value="document" className="bg-zinc-950">Documents</option>
                  <option value="archive" className="bg-zinc-950">Archives</option>
                  <option value="media" className="bg-zinc-950">Media</option>
                  <option value="other" className="bg-zinc-950">Others</option>
                </select>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-900 px-3 py-1.5 rounded-xl text-xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-zinc-300 border-none outline-none font-medium cursor-pointer"
                >
                  <option value="newest" className="bg-zinc-950">Newest First</option>
                  <option value="oldest" className="bg-zinc-950">Oldest First</option>
                  <option value="largest" className="bg-zinc-950">Largest Size</option>
                  <option value="smallest" className="bg-zinc-950">Smallest Size</option>
                </select>
              </div>
            </div>
          </div>

          {/* Files Browser Display */}
          <div className="flex-grow min-h-[400px] flex flex-col">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading-spinner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-grow flex flex-col items-center justify-center py-20"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-10 h-10 border-2 border-zinc-800 border-t-white rounded-full mb-4"
                  />
                  <p className="text-zinc-500 text-sm font-mono">RETRIEVING FILES FROM S3 SECURE DRIVE...</p>
                </motion.div>
              ) : filteredFiles.length === 0 ? (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="flex-grow flex flex-col items-center justify-center border border-zinc-900 border-dashed rounded-2xl p-16 text-center"
                >
                  <div className="w-12 h-12 bg-zinc-950 border border-zinc-900 rounded-xl flex items-center justify-center text-zinc-600 mb-4">
                    <File className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-zinc-300 text-sm">No files found</h3>
                  <p className="text-zinc-500 text-xs mt-1.5 max-w-sm">
                    {searchQuery || fileTypeFilter !== 'all'
                      ? 'No files matching the active search query or filter tags.'
                      : 'Upload files on the left control panel to securely store them.'}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="grid-display"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <AnimatePresence mode="popLayout">
                    {filteredFiles.map((file) => {
                      const cleanName = file.key.replace(/^\d+-/, ''); // Strip timestamp for cleaner display
                      const fileUrl = file.url;
                      const isDeleting = deletingKeys[file.key] || false;

                      return (
                        <motion.div
                          key={file.key}
                          layout
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92, y: 10, transition: { duration: 0.25 } }}
                          transition={{ type: 'spring', damping: 25, stiffness: 180 }}
                          className="glass-panel p-5 rounded-2xl flex flex-col justify-between group glass-panel-hover transition-all duration-300 relative overflow-hidden"
                        >
                          {/* Ambient border hover highlight */}
                          <div className="absolute inset-0 border border-white/5 opacity-0 group-hover:opacity-100 rounded-2xl pointer-events-none transition-opacity duration-500" />
                          
                          <div className="flex gap-4">
                            <div className="w-12 h-12 shrink-0 bg-zinc-950 border border-zinc-900 group-hover:border-zinc-800 rounded-xl flex items-center justify-center transition-all duration-300">
                              {getFileIcon(file.key)}
                            </div>
                            <div className="flex-grow min-w-0">
                              <h4 
                                className="font-medium text-zinc-200 group-hover:text-white text-sm truncate transition-colors duration-300 font-display" 
                                title={cleanName}
                              >
                                {cleanName}
                              </h4>
                              <p className="text-[10px] text-zinc-500 font-mono mt-1 flex items-center gap-1.5">
                                <span>{formatBytes(file.size)}</span>
                                <span className="text-zinc-800">•</span>
                                <span>{new Date(file.lastModified).toLocaleDateString()}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-zinc-900/60">
                            
                            {/* Copy Link Action */}
                            <button
                              onClick={() => copyLink(fileUrl, file.key)}
                              className="flex-grow flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-zinc-950 border border-zinc-900 hover:border-zinc-700 text-xs font-medium text-zinc-400 hover:text-white transition-all duration-300"
                              title="Copy temporary presigned URL"
                            >
                              {copiedKey === file.key ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-white animate-scale" />
                                  <span className="text-white">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Link</span>
                                </>
                              )}
                            </button>

                            {/* View / Download Direct Link */}
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-10 h-9 rounded-lg bg-zinc-950 border border-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all duration-300"
                              title="Download File"
                            >
                              <Download className="w-4 h-4" />
                            </a>

                            {/* Secure Delete */}
                            <button
                              onClick={() => deleteFile(file.key)}
                              disabled={isDeleting}
                              className="w-10 h-9 rounded-lg bg-zinc-950 border border-zinc-900 hover:border-red-900 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 flex items-center justify-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Secure Delete"
                            >
                              {isDeleting ? (
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                  className="w-4 h-4 border-2 border-zinc-800 border-t-red-500 rounded-full"
                                />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900/60 bg-zinc-950/20 py-6 text-center font-mono text-[10px] text-zinc-600">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 CLOUD_DRIVE_LITE. POWERED BY S3 PRIVATE SPACES & EXPRESS SECURE.</p>
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">AES-256 ENCRYPTED TRANSIT</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
