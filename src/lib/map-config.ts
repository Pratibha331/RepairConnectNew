export const mapConfig = {
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  libraries: ["places"],
  region: "IN", // Set region to India
  language: "en",
};

export const defaultCenter = {
  lat: 12.9716,  // Bangalore coordinates
  lng: 77.5946,
};

export const mapStyles = {
  default: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
  ],
};

export const mapOptions = {
  fullscreenControl: true,
  streetViewControl: true,
  mapTypeControl: true,
  zoomControl: true,
};