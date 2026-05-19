import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  // Settings / API key
  store: {
    getApiKey: () => ipcRenderer.invoke('store:getApiKey'),
    setApiKey: (key: string) => ipcRenderer.invoke('store:setApiKey', key),
    deleteApiKey: () => ipcRenderer.invoke('store:deleteApiKey'),
    hasApiKey: () => ipcRenderer.invoke('store:hasApiKey'),
    getGroqApiKey: () => ipcRenderer.invoke('store:getGroqApiKey'),
    setGroqApiKey: (key: string) => ipcRenderer.invoke('store:setGroqApiKey', key),
    deleteGroqApiKey: () => ipcRenderer.invoke('store:deleteGroqApiKey'),
    hasGroqApiKey: () => ipcRenderer.invoke('store:hasGroqApiKey'),
    getSettings: () => ipcRenderer.invoke('store:getSettings'),
    setSettings: (s: Record<string, unknown>) => ipcRenderer.invoke('store:setSettings', s),
    getLogoSettings: () => ipcRenderer.invoke('store:getLogoSettings'),
    setLogoSettings: (s: Record<string, unknown>) => ipcRenderer.invoke('store:setLogoSettings', s),
  },

  // File dialogs
  files: {
    openVideo: () => ipcRenderer.invoke('files:openVideo'),
    openAny: () => ipcRenderer.invoke('files:openAny'),
    saveFile: (opts: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('files:saveFile', opts),
    openProject: () => ipcRenderer.invoke('files:openProject'),
    saveProject: (data: string, filePath?: string) =>
      ipcRenderer.invoke('files:saveProject', data, filePath),
    readFile: (filePath: string) => ipcRenderer.invoke('files:readFile', filePath),
    writeFile: (filePath: string, data: string | Buffer) =>
      ipcRenderer.invoke('files:writeFile', filePath, data),
    getTmpDir: () => ipcRenderer.invoke('files:getTmpDir'),
    pickFolder: () => ipcRenderer.invoke('files:pickFolder'),
    mkdir: (dirPath: string) => ipcRenderer.invoke('files:mkdir', dirPath),
    exists: (filePath: string) => ipcRenderer.invoke('files:exists', filePath),
    getDownloadsDir: () => ipcRenderer.invoke('files:getDownloadsDir'),
    listDownloads: (): Promise<{ name: string; path: string; createdAt: number }[]> => ipcRenderer.invoke('files:listDownloads'),
    getDownloadsSize: () => ipcRenderer.invoke('files:getDownloadsSize'),
    clearDownloads: () => ipcRenderer.invoke('files:clearDownloads'),
    deleteDownload: (filePath: string) => ipcRenderer.invoke('files:deleteDownload', filePath),
    pickLogo: () => ipcRenderer.invoke('files:pickLogo'),
    getLogoPath: () => ipcRenderer.invoke('files:getLogoPath'),
    deleteLogo: () => ipcRenderer.invoke('files:deleteLogo'),
    pickIntroVideo: () => ipcRenderer.invoke('files:pickIntroVideo'),
    getIntroVideoPath: () => ipcRenderer.invoke('files:getIntroVideoPath'),
    deleteIntroVideo: () => ipcRenderer.invoke('files:deleteIntroVideo'),
    pickAudioBackground: () => ipcRenderer.invoke('files:pickAudioBackground'),
    getAudioBackgroundPath: () => ipcRenderer.invoke('files:getAudioBackgroundPath'),
    deleteAudioBackground: () => ipcRenderer.invoke('files:deleteAudioBackground'),
    openAudio: () => ipcRenderer.invoke('files:openAudio'),
    saveRecovery: (data: string) => ipcRenderer.invoke('files:saveRecovery', data),
    getRecovery: (): Promise<string | null> => ipcRenderer.invoke('files:getRecovery'),
    clearRecovery: () => ipcRenderer.invoke('files:clearRecovery'),
  },

  // Power management
  power: {
    preventSleep: () => ipcRenderer.invoke('power:preventSleep'),
    allowSleep: () => ipcRenderer.invoke('power:allowSleep'),
  },

  // ffmpeg
  ffmpeg: {
    extractAudio: (videoPath: string, outputPath: string) =>
      ipcRenderer.invoke('ffmpeg:extractAudio', videoPath, outputPath),
    getVideoDuration: (videoPath: string): Promise<{ duration: number; hasAudio: boolean }> =>
      ipcRenderer.invoke('ffmpeg:getVideoDuration', videoPath),
    detectSilences: (audioPath: string) =>
      ipcRenderer.invoke('ffmpeg:detectSilences', audioPath),
    splitAudio: (audioPath: string, start: number, duration: number, outputPath: string) =>
      ipcRenderer.invoke('ffmpeg:splitAudio', audioPath, start, duration, outputPath),
    exportSoftSubs: (videoPath: string, srtPath: string, outputPath: string) =>
      ipcRenderer.invoke('ffmpeg:exportSoftSubs', videoPath, srtPath, outputPath),
    exportHardSubs: (videoPath: string, srtPath: string, outputPath: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('ffmpeg:exportHardSubs', videoPath, srtPath, outputPath, opts),
    exportClip: (videoPath: string, srtPath: string, startSeconds: number, durationSeconds: number, outputPath: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('ffmpeg:exportClip', videoPath, srtPath, startSeconds, durationSeconds, outputPath, opts),
    exportSegment: (videoPath: string, srtPath: string, startSeconds: number, durationSeconds: number, outputPath: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('ffmpeg:exportSegment', videoPath, srtPath, startSeconds, durationSeconds, outputPath, opts),
    prependIntro: (introPath: string, mainPath: string, outputPath: string) =>
      ipcRenderer.invoke('ffmpeg:prependIntro', introPath, mainPath, outputPath),
    createVideoFromAudio: (audioPath: string, imagePath: string | null, outputPath: string) =>
      ipcRenderer.invoke('ffmpeg:createVideoFromAudio', audioPath, imagePath, outputPath),
    onProgress: (callback: (data: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('ffmpeg:progress', handler)
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler)
    },
  },

  // Gemini
  gemini: {
    transcribeChunk: (audioPath: string, chunkIndex: number, totalChunks: number, offsetSeconds: number) =>
      ipcRenderer.invoke('gemini:transcribeChunk', audioPath, chunkIndex, totalChunks, offsetSeconds),
    translateChunk: (arabicCues: {start: number; end: number; arabic: string}[], chunkIndex: number, totalChunks: number) =>
      ipcRenderer.invoke('gemini:translateChunk', arabicCues, chunkIndex, totalChunks),
    cancelProcessing: () => ipcRenderer.invoke('gemini:cancelProcessing'),
    detectClips: (transcript: string) => ipcRenderer.invoke('gemini:detectClips', transcript),
    detectSegments: (transcript: string, durationRange: string) => ipcRenderer.invoke('gemini:detectSegments', transcript, durationRange),
    scrutinize: (cues: { id: string; arabic: string; english: string }[]) => ipcRenderer.invoke('gemini:scrutinize', cues),
    onChunkProgress: (callback: (data: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('gemini:chunkProgress', handler)
      return () => ipcRenderer.removeListener('gemini:chunkProgress', handler)
    },
  },

  // YouTube download
  youtube: {
    download: (url: string, outputDir: string) => ipcRenderer.invoke('youtube:download', url, outputDir),
    cancel: () => ipcRenderer.invoke('youtube:cancel'),
    onProgress: (callback: (data: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('youtube:progress', handler)
      return () => ipcRenderer.removeListener('youtube:progress', handler)
    },
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Utility
  getFilePath: (file: File) => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
