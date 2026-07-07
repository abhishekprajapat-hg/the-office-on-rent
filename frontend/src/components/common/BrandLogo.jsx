import React from "react";

const BrandLogo = ({ className = "", alt = "The Office On Rent logo" }) => (
  <img
    src="/theofficeonrentlogo.png"
    alt={alt}
    className={`bg-white object-contain ${className}`.trim()}
  />
);

export default BrandLogo;
