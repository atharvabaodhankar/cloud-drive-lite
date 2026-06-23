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
  Filter,
  User,
  LogOut,
  Mail,
  KeyRound,
  History,
  Clock,
  Unlock
} from 'lucide-react';
import confetti from 'canvas-confetti';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  // Auth States
  const [token, setToken] = useState(localStorage.getItem('clouddrive_access_token') || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('clouddrive_user')) || null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register' | 'forgot_password' | 'reset_password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Dashboard States
  const [files, setFiles] = useState([]);
  const [activities, setActivities] = useState([]);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  // Secure Interceptor Fetch Helper
  const authenticatedFetch = async (url, options = {}) => {
    const accessToken = localStorage.getItem('clouddrive_access_token');
    
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`
    };

    let response = await fetch(url, options);

    // If access token is expired/invalid (403), rotate token dynamically
    if (response.status === 403) {
      const rotatedToken = await handleTokenRefresh();
      if (rotatedToken) {
        options.headers['Authorization'] = `Bearer ${rotatedToken}`;
        response = await fetch(url, options);
      }
    }

    return response;
  };

  // Refresh Token Rotation
  const handleTokenRefresh = async () => {
    const storedRefreshToken = localStorage.getItem('clouddrive_refresh_token');
    if (!storedRefreshToken) {
      handleLogout();
      return null;
    }

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken })
      });

      const data = await res.json();
      if (res.ok && data.accessToken) {
        localStorage.setItem('clouddrive_access_token', data.accessToken);
        setToken(data.accessToken);
        return data.accessToken;
      } else {
        handleLogout();
        showToast('Your session expired. Please sign in again.', 'error');
        return null;
      }
    } catch (err) {
      handleLogout();
      return null;
    }
  };

  // Check connection to server
  const checkConnection = async () => {
    try {
      const response = await fetch(`${API_URL}/`);
      if (response.ok) {
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    } catch (err) {
      setIsConnected(false);
    }
  };

  // Fetch files (secured with JWT)
  const loadFiles = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await authenticatedFetch(`${API_URL}/files`);

      if (response.status === 401) {
        handleLogout();
        showToast('Session expired. Please log in.', 'error');
        return;
      }

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

  // Fetch Audit Log Activities
  const loadActivities = async () => {
    if (!token) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/activities`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setActivities(data.activities);
        }
      }
    } catch (err) {
      console.error('Failed to load activities:', err);
    }
  };

  // Detect Password Reset Token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlResetToken = params.get('token');
    if (urlResetToken) {
      setAuthMode('reset_password');
      setResetToken(urlResetToken);
      // Clean query parameters from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch dashboard data
  useEffect(() => {
    checkConnection();
    if (token) {
      loadFiles();
      loadActivities();
    }
  }, [token]);

  // Auth Form Submit
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (authMode === 'forgot_password') {
      if (!email) return setAuthError('Email is required.');
      setAuthLoading(true);
      try {
        const response = await fetch(`${API_URL}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (response.ok) {
          setAuthSuccess(data.message);
          setEmail('');
        } else {
          setAuthError(data.error || 'Request failed.');
        }
      } catch (err) {
        setAuthError('Connection error.');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (authMode === 'reset_password') {
      if (!newPassword || newPassword.length < 6) {
        return setAuthError('Password must be at least 6 characters.');
      }
      setAuthLoading(true);
      try {
        const response = await fetch(`${API_URL}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, newPassword })
        });
        const data = await response.json();
        if (response.ok) {
          setAuthSuccess(data.message);
          setTimeout(() => {
            setAuthMode('login');
            setAuthSuccess('');
          }, 3000);
        } else {
          setAuthError(data.error || 'Reset failed.');
        }
      } catch (err) {
        setAuthError('Connection error.');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (!email || !password) {
      setAuthError('Please fill in all fields.');
      return;
    }
    setAuthLoading(true);

    const url = authMode === 'login' ? `${API_URL}/auth/login` : `${API_URL}/auth/register`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        if (authMode === 'login') {
          localStorage.setItem('clouddrive_access_token', data.accessToken);
          localStorage.setItem('clouddrive_refresh_token', data.refreshToken);
          localStorage.setItem('clouddrive_user', JSON.stringify(data.user));
          setToken(data.accessToken);
          setUser(data.user);
          showToast(`Welcome back, ${data.user.email}!`, 'success');
        } else {
          setAuthMode('login');
          setPassword('');
          showToast('Registration successful! Please log in.', 'success');
        }
      } else {
        setAuthError(data.error || 'Authentication failed.');
      }
    } catch (err) {
      setAuthError('Connection error.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout action
  const handleLogout = async () => {
    const storedRefreshToken = localStorage.getItem('clouddrive_refresh_token');
    if (storedRefreshToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefreshToken })
        });
      } catch (e) {
        console.error('Logout invalidation error:', e);
      }
    }
    localStorage.removeItem('clouddrive_access_token');
    localStorage.removeItem('clouddrive_refresh_token');
    localStorage.removeItem('clouddrive_user');
    setToken(null);
    setUser(null);
    setFiles([]);
    setActivities([]);
    setEmail('');
    setPassword('');
    setNewPassword('');
    setResetToken('');
    showToast('Logged out securely.', 'success');
  };

  // Upload file
  const uploadFile = (file) => {
    if (!token) return;
    if (file.size > 26214400) {
      showToast('File exceeds the 25MB limit.', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadFileName(file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/upload`, true);
    
    const accessToken = localStorage.getItem('clouddrive_access_token');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      
      // Token expired hook
      if (xhr.status === 403) {
        handleTokenRefresh().then((newToken) => {
          if (newToken) {
            showToast('Access token refreshed. Please try uploading the file again.', 'info');
          }
        });
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success) {
            showToast('File uploaded and secured successfully.', 'success');
            confetti({
              particleCount: 80,
              spread: 60,
              origin: { y: 0.8 },
              colors: ['#ffffff', '#a1a1aa', '#3f3f46', '#27272a']
            });
            loadFiles();
            loadActivities();
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
  const deleteFile = async (id) => {
    if (!token) return;
    setDeletingKeys((prev) => ({ ...prev, [id]: true }));
    try {
      const response = await authenticatedFetch(`${API_URL}/files/${id}`, {
        method: 'DELETE'
      });

      if (response.status === 401) {
        handleLogout();
        showToast('Session expired.', 'error');
        return;
      }

      const data = await response.json();
      if (data.success) {
        showToast('File deleted securely.', 'success');
        setFiles((prev) => prev.filter((file) => file.id !== id));
        loadActivities();
      } else {
        showToast(data.error || 'Deletion failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to delete file.', 'error');
    } finally {
      setDeletingKeys((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Copy URL with clipboard
  const copyLink = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(id);
    showToast('Secure S3 presigned URL copied.', 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Download Route Trigger (logs download activity)
  const triggerDownload = async (id) => {
    try {
      const response = await authenticatedFetch(`${API_URL}/files/download/${id}`);
      const data = await response.json();
      if (data.success && data.downloadUrl) {
        // Open download link in new window/tab
        window.open(data.downloadUrl, '_blank');
        loadActivities();
      } else {
        showToast(data.error || 'Download failed.', 'error');
      }
    } catch (err) {
      showToast('Connection error during download request.', 'error');
    }
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
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return <Image className={style} />;
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return <Video className={style} />;
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return <Music className={style} />;
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return <FileArchive className={style} />;
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json'].includes(ext)) return <FileText className={style} />;
    return <File className={style} />;
  };

  // Classify file type for tag filter
  const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json'].includes(ext)) return 'document';
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return 'archive';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'media';
    return 'other';
  };

  // Quota dynamic limits
  const totalStorageUsed = files.reduce((sum, file) => sum + file.size, 0);
  const quotaLimit = user?.quotaLimit || 104857600; // default 100MB
  const storagePercentage = Math.min((totalStorageUsed / quotaLimit) * 100, 100);

  // Filter & Sort files
  const filteredFiles = files
    .filter((file) => {
      const filename = file.filename || file.key.split('/').pop();
      const matchesSearch = filename.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = fileTypeFilter === 'all' || getFileType(filename) === fileTypeFilter;
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
      
      {/* Ambient Glows */}
      <motion.div 
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 40, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-zinc-800/10 rounded-full glow-spot pulse-glow"
      />
      <motion.div 
        animate={{ x: [0, -40, 20, 0], y: [0, 50, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-zinc-900/20 rounded-full glow-spot pulse-glow"
      />

      {/* Glass Toasts */}
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
              <div className="flex-1 text-sm font-medium text-zinc-200">{toast.message}</div>
              <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
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

          {/* User Details & Connection Status */}
          <div className="flex items-center gap-3">
            {token && user && (
              <div className="flex items-center gap-3 pr-3 border-r border-zinc-900">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-300 font-medium font-mono">{user.email}</span>
                </div>
                
                {/* Audit Activities Logs Toggle Button */}
                <button
                  onClick={() => {
                    loadActivities();
                    setIsActivityOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-all"
                  title="Open activity audit logs"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Activity Logs</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-850 border border-zinc-800 rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Logout</span>
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-950 border border-zinc-900 text-xs">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse' : 'bg-red-500'}`} />
              <span className="font-mono text-[11px] text-zinc-400">
                {isConnected ? 'NODE_SECURE_CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Sliding Activity Logs Sidebar Drawer */}
      <AnimatePresence>
        {isActivityOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsActivityOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md glass-panel z-50 p-6 flex flex-col gap-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-5 h-5 text-white" />
                  <h3 className="font-display font-semibold text-white text-base">Activity Audit Log</h3>
                </div>
                <button
                  onClick={() => setIsActivityOpen(false)}
                  className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Logs Feed */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {activities.length === 0 ? (
                  <div className="text-center py-20 text-zinc-500 text-xs font-mono">
                    NO RECORDED DRIVE OPERATIONS YET.
                  </div>
                ) : (
                  activities.map((act, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="p-3.5 bg-zinc-950 border border-zinc-900 rounded-xl flex flex-col gap-1.5 hover:border-zinc-800 transition-colors"
                    >
                      <p className="text-xs text-zinc-200 font-medium">{act.action}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                        <Clock className="w-3 h-3 text-zinc-600" />
                        <span>{new Date(act.created_at).toLocaleString()}</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <div className="text-center text-[10px] text-zinc-600 font-mono border-t border-zinc-900 pt-4">
                LOGS STORED RELATIONAL TO POSTGRESQL ENGINE
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Client views conditional routing */}
      <AnimatePresence mode="wait">
        {!token ? (
          // --- AUTH CARD PANELS ---
          <motion.div
            key="auth-screen"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-grow flex items-center justify-center px-6 py-20 relative z-10"
          >
            <div className="w-full max-w-md glass-panel p-8 rounded-3xl flex flex-col gap-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-zinc-800 via-white to-zinc-800" />
              
              {/* Title Header */}
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-900 flex items-center justify-center text-white mb-2">
                  <LockKeyhole className="w-5 h-5 text-zinc-300" />
                </div>
                <h3 className="font-display font-bold text-white text-lg tracking-wide">
                  {authMode === 'forgot_password' && 'Recover Drive Key'}
                  {authMode === 'reset_password' && 'Change Private Password'}
                  {(authMode === 'login' || authMode === 'register') && 'Secure Storage Gateway'}
                </h3>
                <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                  {authMode === 'forgot_password' && 'Enter your registered email address to print a mock password recovery link to the backend logs.'}
                  {authMode === 'reset_password' && 'Enter a secure new password for your sandboxed storage drive.'}
                  {(authMode === 'login' || authMode === 'register') && 'Authentication is required to access your private sandboxed files and storage directories.'}
                </p>
              </div>

              {/* Login / Register tab selectors */}
              {(authMode === 'login' || authMode === 'register') && (
                <div className="flex bg-zinc-950 border border-zinc-900 p-1.5 rounded-xl text-xs font-mono relative">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                    className={`flex-1 py-2 text-center rounded-lg transition-colors relative z-10 ${authMode === 'login' ? 'text-black font-semibold' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    SIGN_IN
                    {authMode === 'login' && (
                      <motion.div
                        layoutId="active-auth-tab"
                        className="absolute inset-0 bg-white rounded-lg -z-10"
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}
                    className={`flex-1 py-2 text-center rounded-lg transition-colors relative z-10 ${authMode === 'register' ? 'text-black font-semibold' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    REGISTER
                    {authMode === 'register' && (
                      <motion.div
                        layoutId="active-auth-tab"
                        className="absolute inset-0 bg-white rounded-lg -z-10"
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                      />
                    )}
                  </button>
                </div>
              )}

              {/* Input Forms */}
              <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                
                {authError && (
                  <div className="p-3.5 rounded-xl border border-red-950 bg-red-950/15 text-xs text-red-400 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                {authSuccess && (
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/40 text-xs text-white flex gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authSuccess}</span>
                  </div>
                )}

                {/* Email (not displayed in reset mode) */}
                {authMode !== 'reset_password' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-mono tracking-wider">EMAIL_ADDRESS</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        required
                        className="w-full pl-11 pr-4 py-2.5 bg-zinc-950 border border-zinc-900 focus:border-zinc-700 rounded-xl text-sm focus:outline-none placeholder-zinc-700 transition-colors text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Password (displayed in login/register) */}
                {(authMode === 'login' || authMode === 'register') && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-zinc-500 font-mono tracking-wider">SECURE_PASSWORD</label>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('forgot_password'); setAuthError(''); setAuthSuccess(''); }}
                        className="text-[10px] text-zinc-400 hover:text-white font-mono hover:underline"
                      >
                        FORGOT_PASS?
                      </button>
                    </div>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-11 pr-4 py-2.5 bg-zinc-950 border border-zinc-900 focus:border-zinc-700 rounded-xl text-sm focus:outline-none placeholder-zinc-700 transition-colors text-white"
                      />
                    </div>
                  </div>
                )}

                {/* New Password (displayed in reset) */}
                {authMode === 'reset_password' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-mono tracking-wider">NEW_SECURE_PASSWORD</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-11 pr-4 py-2.5 bg-zinc-950 border border-zinc-900 focus:border-zinc-700 rounded-xl text-sm focus:outline-none placeholder-zinc-700 transition-colors text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Form Buttons */}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 py-3 bg-white text-black hover:bg-zinc-200 transition-all font-semibold rounded-xl text-xs flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-black border-t-transparent rounded-full"
                    />
                  ) : (
                    <span>
                      {authMode === 'login' && 'ENTER_SECURE_DRIVE'}
                      {authMode === 'register' && 'CREATE_SECURE_DRIVE'}
                      {authMode === 'forgot_password' && 'SEND_RESET_LINK'}
                      {authMode === 'reset_password' && 'UPDATE_PASSWORD'}
                    </span>
                  )}
                </button>

                {/* Return links */}
                {authMode === 'forgot_password' && (
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                    className="text-xs text-zinc-400 hover:text-white font-mono hover:underline mt-2 text-center"
                  >
                    ← RETURN_TO_SIGN_IN
                  </button>
                )}
              </form>

              <div className="flex items-center gap-2 justify-center text-[10px] text-zinc-600 font-mono mt-2 border-t border-zinc-900 pt-4">
                <Shield className="w-3.5 h-3.5 text-zinc-700" />
                <span>POSTGRESQL & BCRYPT PROTECTED DATA MIGRATION</span>
              </div>

            </div>
          </motion.div>
        ) : (
          // --- SECURED STORAGE DASHBOARD ---
          <motion.div
            key="dashboard-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-grow max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10"
          >
            {/* Left Panel - Upload & Analytics (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Glass Storage Quota stats */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="glass-panel p-6 rounded-2xl flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="w-5 h-5 text-zinc-400" />
                    <h3 className="font-display font-semibold text-white text-base">Drive Account Limit</h3>
                  </div>
                  <span className="text-xs font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                    {formatBytes(quotaLimit)} LIMIT
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-xs font-mono">
                    <span className="text-zinc-500">USED</span>
                    <span className="text-white font-medium">
                      {formatBytes(totalStorageUsed)} / {formatBytes(quotaLimit)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-zinc-900/80 rounded-full overflow-hidden border border-zinc-900">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${storagePercentage}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        storagePercentage > 90 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]'
                      }`}
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
                    <span className="text-[10px] text-zinc-500 font-mono uppercase">Private Files</span>
                    <p className="text-2xl font-bold font-display text-white mt-1">{files.length}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-mono uppercase">Quota Free</span>
                    <p className="text-base font-semibold text-zinc-400 mt-2 font-mono">
                      {formatBytes(Math.max(quotaLimit - totalStorageUsed, 0))}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Upload Drop Zone */}
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

              {/* Secure audit indicators */}
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
                    <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">✓</div>
                    <div>
                      <p className="font-medium text-zinc-200">JWT Token Rotation</p>
                      <p className="text-[10px] text-zinc-500">Access expiry (15m) & Refresh tokens (7d)</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">✓</div>
                    <div>
                      <p className="font-medium text-zinc-200">Disk Quotas Checked</p>
                      <p className="text-[10px] text-zinc-500">Stops uploads on DB query limit calculations</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">✓</div>
                    <div>
                      <p className="font-medium text-zinc-200">Audit Activity logger</p>
                      <p className="text-[10px] text-zinc-500">Logs logins, uploads, edits and downloads</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">✓</div>
                    <div>
                      <p className="font-medium text-zinc-200">Console Password Resets</p>
                      <p className="text-[10px] text-zinc-500">One-hour token reset links in backend logs</p>
                    </div>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white font-bold">✓</div>
                    <div>
                      <p className="font-medium text-zinc-200">Isolated S3 Folders</p>
                      <p className="text-[10px] text-zinc-500">Compartments users/{"{"}user_id{"}"}/ storage</p>
                    </div>
                  </li>
                </ul>
              </motion.div>

            </div>

            {/* Right Panel - Files Browser (8 cols) */}
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* Filters & search */}
              <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
                {/* Search */}
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search your secured files..."
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
                          const isDeleting = deletingKeys[file.id] || false;

                          return (
                            <motion.div
                              key={file.id}
                              layout
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.92, y: 10, transition: { duration: 0.25 } }}
                              transition={{ type: 'spring', damping: 25, stiffness: 180 }}
                              className="glass-panel p-5 rounded-2xl flex flex-col justify-between group glass-panel-hover transition-all duration-300 relative overflow-hidden"
                            >
                              <div className="absolute inset-0 border border-white/5 opacity-0 group-hover:opacity-100 rounded-2xl pointer-events-none transition-opacity duration-500" />
                              
                              <div className="flex gap-4">
                                <div className="w-12 h-12 shrink-0 bg-zinc-950 border border-zinc-900 group-hover:border-zinc-800 rounded-xl flex items-center justify-center transition-all duration-300">
                                  {getFileIcon(file.filename)}
                                </div>
                                <div className="flex-grow min-w-0">
                                  <h4 
                                    className="font-medium text-zinc-200 group-hover:text-white text-sm truncate transition-colors duration-300 font-display" 
                                    title={file.filename}
                                  >
                                    {file.filename}
                                  </h4>
                                  <p className="text-[10px] text-zinc-500 font-mono mt-1 flex items-center gap-1.5">
                                    <span>{formatBytes(file.size)}</span>
                                    <span className="text-zinc-800">•</span>
                                    <span>{new Date(file.lastModified).toLocaleDateString()}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-zinc-900/60">
                                
                                {/* Copy secure presigned S3 url */}
                                <button
                                  onClick={() => copyLink(file.url, file.id)}
                                  className="flex-grow flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-zinc-950 border border-zinc-900 hover:border-zinc-700 text-xs font-medium text-zinc-400 hover:text-white transition-all duration-300"
                                  title="Copy temporary presigned URL"
                                >
                                  {copiedKey === file.id ? (
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

                                {/* Direct Secure Download with activity logging */}
                                <button
                                  onClick={() => triggerDownload(file.id)}
                                  className="w-10 h-9 rounded-lg bg-zinc-950 border border-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all duration-300"
                                  title="Secure Audit Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>

                                {/* Secure Delete */}
                                <button
                                  onClick={() => deleteFile(file.id)}
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

          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-zinc-900/60 bg-zinc-950/20 py-6 text-center font-mono text-[10px] text-zinc-600">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 CLOUD_DRIVE_LITE. POWERED BY S3 PRIVATE SPACES & POSTGRES MIGRATION.</p>
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">AES-256 JWT ROTATING TRANSIT</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
