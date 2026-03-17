import { useEffect } from 'react';

/** Set the document title, restoring the previous title on unmount */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title ? `${title} - Meridian` : 'Meridian';
    return () => {
      document.title = prevTitle;
    };
  }, [title]);
}
