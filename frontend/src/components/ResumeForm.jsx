import React, { useRef, useState } from 'react';

function ResumeForm({ onFileSelect, selectedFile }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      onFileSelect(files[0]);
    } else {
      alert('Please upload a PDF file.');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      onFileSelect(file);
    } else if (file) {
      alert('Please upload a PDF file.');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      className={`drop-zone rounded-xl p-8 text-center cursor-pointer transition-all duration-300 min-h-[200px] flex flex-col items-center justify-center ${
        isDragging ? 'active border-primary-400 bg-primary-500/5' : ''
      } ${selectedFile ? 'border-accent-500/50 bg-accent-500/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="hidden"
        id="resume-file-input"
      />

      {selectedFile ? (
        <div className="animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-accent-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white font-semibold text-base mb-1">{selectedFile.name}</p>
          <p className="text-surface-200 text-sm">{formatFileSize(selectedFile.size)}</p>
          <p className="text-primary-400 text-xs mt-3">Click to change file</p>
        </div>
      ) : (
        <div>
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Drop your resume PDF here</p>
          <p className="text-surface-200 text-sm">or click to browse</p>
          <p className="text-surface-700 text-xs mt-3">PDF files only • Max 10MB</p>
        </div>
      )}
    </div>
  );
}

export default ResumeForm;
