import { useCallback, useEffect, useState } from "react";
import { GoogleMap, useJsApiLoader, Marker, Circle } from "@react-google-maps/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ServiceAreaMapProps {
  lat: number;
  lng: number;
  radiusKm: number;
  onLocationChange?: (lat: number, lng: number, address?: string) => void;
  editable?: boolean;
}

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "8px",
};

export const ServiceAreaMap = ({
  lat,
  lng,
  radiusKm,
  onLocationChange,
  editable = false,
}: ServiceAreaMapProps) => {
  const [center, setCenter] = useState({ lat, lng });
  const [markerPosition, setMarkerPosition] = useState({ lat, lng });

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });

  useEffect(() => {
    setCenter({ lat, lng });
    setMarkerPosition({ lat, lng });
  }, [lat, lng]);

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!editable || !e.latLng || !onLocationChange) return;

      const newLat = e.latLng.lat();
      const newLng = e.latLng.lng();
      setMarkerPosition({ lat: newLat, lng: newLng });
      setCenter({ lat: newLat, lng: newLng });

      // Reverse geocode to get address
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          onLocationChange(newLat, newLng, results[0].formatted_address);
        } else {
          onLocationChange(newLat, newLng);
        }
      });
    },
    [editable, onLocationChange]
  );

  if (!isLoaded) {
    return (
      <Card className="p-4">
        <Skeleton className="w-full h-[400px]" />
      </Card>
    );
  }

  const circleOptions = {
    strokeColor: "hsl(var(--primary))",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "hsl(var(--primary))",
    fillOpacity: 0.15,
    clickable: false,
    draggable: false,
    editable: false,
    visible: true,
    radius: radiusKm * 1000, // Convert km to meters
    zIndex: 1,
  };

  return (
    <div className="space-y-2">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={13}
        onClick={onMapClick}
        options={{
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        }}
      >
        <Marker 
          position={markerPosition}
          draggable={editable}
          onDragEnd={onMapClick}
        />
        <Circle center={markerPosition} options={circleOptions} />
      </GoogleMap>
      {editable && (
        <p className="text-sm text-muted-foreground">
          Click on the map to set your location. The circle shows your service area ({radiusKm} km radius).
        </p>
      )}
      {!editable && (
        <p className="text-sm text-muted-foreground">
          Service area: {radiusKm} km radius
        </p>
      )}
    </div>
  );
};
