import { useState } from "react";

export const MAYO_CREST_URL = "https://upload.wikimedia.org/wikipedia/en/b/b5/Mayo_College_logo.png";
export const BRAND_CREST_PATH = "/branding-logo.png";

export default function CrestLogo({
  className = "",
  sizeClass = "h-10 w-10",
  imgClassName = "h-full w-full rounded-full object-contain p-1",
  fallbackText = "MC",
  alt = "Mayo College Crest",
}) {
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  return (
    <div className={`flex items-center justify-center rounded-full border border-[#C5A059] bg-white ${sizeClass} ${className}`}>
      {!imgError ? (
        <img src={BRAND_CREST_PATH} alt={alt} onError={() => setImgError(true)} className={imgClassName} />
      ) : !fallbackError ? (
        <img src={MAYO_CREST_URL} alt={alt} onError={() => setFallbackError(true)} className={imgClassName} />
      ) : (
        <span className="text-[10px] font-semibold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          {fallbackText}
        </span>
      )}
    </div>
  );
}
