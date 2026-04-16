const parseFilenameFromDisposition = (disposition = '') => {
  if (!disposition) {
    return '';
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (error) {
      return utf8Match[1];
    }
  }

  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return filenameMatch?.[1] || '';
};

export const downloadBlobResponse = (response, fallbackFilename = 'download.bin') => {
  const responseData = response?.data;
  const blob = responseData instanceof Blob ? responseData : new Blob([responseData]);
  const filename = parseFilenameFromDisposition(response?.headers?.['content-disposition']) || fallbackFilename;
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(downloadUrl);
  }, 0);
};
