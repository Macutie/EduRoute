import { useEffect, useState } from 'react';
import { API_BASE_URL, resolveMediaUrl } from '../../config';

const isProtectedMediaUrl = (value) => String(value || '').includes('/api/secure-media/');

const ProtectedMedia = ({ src, alt = '', className, ...props }) => {
  const [objectUrl, setObjectUrl] = useState(null);

  useEffect(() => {
    let active = true;
    let createdUrl = null;
    const sourceUrl = resolveMediaUrl(src);

    if (!sourceUrl || !isProtectedMediaUrl(sourceUrl)) {
      setObjectUrl(sourceUrl || null);
      return () => {};
    }

    const token = localStorage.getItem('token') || '';
    const controller = new AbortController();
    fetch(sourceUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Protected media request failed (${response.status})`);
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Failed to load protected media:', error);
      });

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  if (!objectUrl) return null;
  return <img src={objectUrl} alt={alt} className={className} {...props} />;
};

export default ProtectedMedia;
