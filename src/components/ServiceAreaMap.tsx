import { useCallback, useEffect, useState, useRef } from "react";
import { GoogleMap, useJsApiLoader, Marker, Circle, Autocomplete } from "@react-google-maps/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  const onAutocompleteLoad = (autocomplete: google.maps.places.Autocomplete) => {
    setAutocomplete(autocomplete);
  };

  const handlePlaceSelect = useCallback(() => {
    if (autocomplete && editable) {
      setSearchLoading(true);
      const place = autocomplete.getPlace();
      
      if (place.geometry?.location) {
        const newPosition = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setMarkerPosition(newPosition);
        setCenter(newPosition);
        if (onLocationChange) {
          onLocationChange(
            newPosition.lat,
            newPosition.lng,
            place.formatted_address || ""
          );
        }
      }
      setSearchLoading(false);
    }
  }, [autocomplete, editable, onLocationChange]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInputRef.current?.value && editable) {
      setSearchLoading(true);
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode(
        { address: searchInputRef.current.value },
        (results, status) => {
          if (status === "OK" && results?.[0]) {
            const location = results[0].geometry.location;
            const newPosition = {
              lat: location.lat(),
              lng: location.lng()
            };
            setMarkerPosition(newPosition);
            setCenter(newPosition);
            if (onLocationChange) {
              onLocationChange(
                newPosition.lat,
                newPosition.lng,
                results[0].formatted_address
              );
            }
          } else {
            setError("Location not found. Please try a different search.");
          }
          setSearchLoading(false);
        }
      );
    }
  };

  useEffect(() => {
    // If no initial position and editable, request user's location
    if ((!lat || !lng) && editable) {
      if ("geolocation" in navigator) {
        navigator.permissions.query({ name: "geolocation" }).then((result) => {
          if (result.state === "granted" || result.state === "prompt") {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const userLocation = {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude
                };
                setCenter(userLocation);
                setMarkerPosition(userLocation);
                if (onLocationChange) {
                  // Get address for the location
                  const geocoder = new google.maps.Geocoder();
                  geocoder.geocode({ location: userLocation }, (results, status) => {
                    if (status === "OK" && results?.[0]) {
                      onLocationChange(userLocation.lat, userLocation.lng, results[0].formatted_address);
                    } else {
                      onLocationChange(userLocation.lat, userLocation.lng);
                    }
                  });
                }
              },
              (error) => {
                console.log("Geolocation error:", error);
                setCenter({ lat, lng });
                setMarkerPosition({ lat, lng });
              }
            );
          }
        });
      }
    } else {
      setCenter({ lat, lng });
      setMarkerPosition({ lat, lng });
    }
  }, [lat, lng, editable, onLocationChange]);

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
