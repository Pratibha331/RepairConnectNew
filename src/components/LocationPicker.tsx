import { useState, useCallback, useEffect, useRef } from "react";
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from "@react-google-maps/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number, address?: string) => void;
  initialLat?: number;
  initialLng?: number;
}

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "8px",
};

const defaultCenter = {
  lat: 40.7128,
  lng: -74.0060,
};

export const LocationPicker = ({
  onLocationSelect,
  initialLat,
  initialLng,
}: LocationPickerProps) => {
  const [markerPosition, setMarkerPosition] = useState<google.maps.LatLngLiteral | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );

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
    if (autocomplete) {
      setSearchLoading(true);
      const place = autocomplete.getPlace();
      
      if (place.geometry?.location) {
        const newPosition = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setMarkerPosition(newPosition);
        onLocationSelect(
          newPosition.lat,
          newPosition.lng,
          place.formatted_address || ""
        );
        setError(null); // Clear any previous errors
      } else {
        setError("Please select a location from the suggestions.");
      }
      setSearchLoading(false);
    }
  }, [autocomplete, onLocationSelect]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInputRef.current?.value) {
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
            onLocationSelect(
              newPosition.lat,
              newPosition.lng,
              results[0].formatted_address
            );
          } else {
            setError("Location not found. Please try a different search.");
          }
          setSearchLoading(false);
        }
      );
    }
  };

  useEffect(() => {
    // If no initial position is set, request user's location
    if (!initialLat && !initialLng) {
      if ("geolocation" in navigator) {
        navigator.permissions.query({ name: "geolocation" }).then((result) => {
          if (result.state === "granted" || result.state === "prompt") {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const userLocation = {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude
                };
                setMarkerPosition(userLocation);
                // Get address for the location
                const geocoder = new google.maps.Geocoder();
                geocoder.geocode({ location: userLocation }, (results, status) => {
                  if (status === "OK" && results?.[0]) {
                    onLocationSelect(userLocation.lat, userLocation.lng, results[0].formatted_address);
                  } else {
                    onLocationSelect(userLocation.lat, userLocation.lng);
                  }
                });
              },
              (error) => {
                console.log("Geolocation error:", error);
                setMarkerPosition(defaultCenter);
              }
            );
          } else {
            setMarkerPosition(defaultCenter);
          }
        });
      } else {
        setMarkerPosition(defaultCenter);
      }
    }
  }, [initialLat, initialLng, onLocationSelect]);

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setMarkerPosition({ lat, lng });

        // Reverse geocode to get address
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            onLocationSelect(lat, lng, results[0].formatted_address);
          } else {
            onLocationSelect(lat, lng);
          }
        });
      }
    },
    [onLocationSelect]
  );

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Error loading Google Maps. Please check your internet connection and try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (!isLoaded) {
    return (
      <Card className="p-4">
        <Skeleton className="w-full h-[400px]" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearchSubmit} className="relative">
        <Autocomplete
          onLoad={onAutocompleteLoad}
          onPlaceChanged={handlePlaceSelect}
          options={{
            types: ['geocode', 'establishment'],
            componentRestrictions: { country: [] }, // Allow worldwide search
            fields: ['geometry', 'formatted_address', 'name'],
          }}
        >
          <div className="flex gap-2">
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search for a location or address..."
              className="flex-1"
              autoComplete="off"
              onChange={() => setError(null)} // Clear error when user types
            />
            <Button type="submit" size="icon" disabled={searchLoading}>
              {searchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </Autocomplete>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={markerPosition || defaultCenter}
        zoom={markerPosition ? 15 : 12}
        onClick={onMapClick}
        options={{
          fullscreenControl: true,
          streetViewControl: true,
          mapTypeControl: true,
        }}
      >
        {markerPosition && <Marker position={markerPosition} />}
      </GoogleMap>
    </div>
  );
};
