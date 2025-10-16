import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, X } from "lucide-react";
import { LocationPicker } from "@/components/LocationPicker";

interface ServiceCategory {
  id: string;
  name: string;
  description: string | null;
}

const CreateRequest = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState({
    category_id: "",
    description: "",
    location_address: "",
    location_lat: "",
    location_lng: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string[]>([]);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from("service_categories")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error loading categories:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load service categories",
      });
    } else {
      setCategories(data || []);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + photos.length > 5) {
      toast({
        variant: "destructive",
        title: "Too many photos",
        description: "You can upload a maximum of 5 photos",
      });
      return;
    }

    setPhotos([...photos, ...files]);
    
    // Create preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPhotoPreview([...photoPreview, ...newPreviews]);
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = photoPreview.filter((_, i) => i !== index);
    
    // Revoke the URL to free memory
    URL.revokeObjectURL(photoPreview[index]);
    
    setPhotos(newPhotos);
    setPhotoPreview(newPreviews);
  };

  const uploadPhotos = async (userId: string): Promise<string[]> => {
    const uploadedUrls: string[] = [];

    for (const photo of photos) {
      const fileExt = photo.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("service-photos")
        .upload(fileName, photo);

      if (uploadError) {
        console.error("Error uploading photo:", uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("service-photos")
        .getPublicUrl(fileName);

      uploadedUrls.push(publicUrl);
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.category_id || !formData.description || !formData.location_lat || !formData.location_lng) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Please fill in all required fields including location",
      });
      return;
    }

    const lat = formData.location_lat;
    const lng = formData.location_lng;

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload photos if any
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        setUploadingPhoto(true);
        photoUrls = await uploadPhotos(user.id);
        setUploadingPhoto(false);
      }

      // Create service request
      const { error } = await supabase
        .from("service_requests")
        .insert({
          resident_id: user.id,
          category_id: formData.category_id,
          description: formData.description,
          location_address: formData.location_address || null,
          location_lat: parseFloat(lat),
          location_lng: parseFloat(lng),
          photos: photoUrls,
          status: "pending",
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Service request created successfully",
      });

      navigate("/");
    } catch (error: any) {
      console.error("Error creating request:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create service request",
      });
    } finally {
      setLoading(false);
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <header className="border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Create Service Request</CardTitle>
            <CardDescription>
              Fill in the details below to request a service from nearby providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="category">Service Category *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the issue or service you need..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={5}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Click on the map to select your location
                </p>
                <LocationPicker
                  onLocationSelect={(lat, lng, address) => {
                    setFormData({
                      ...formData,
                      location_lat: lat.toString(),
                      location_lng: lng.toString(),
                      location_address: address || formData.location_address,
                    });
                  }}
                  initialLat={formData.location_lat ? parseFloat(formData.location_lat) : undefined}
                  initialLng={formData.location_lng ? parseFloat(formData.location_lng) : undefined}
                />
                {formData.location_address && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selected: {formData.location_address}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Photos (Optional)</Label>
                <div className="space-y-4">
                  {photoPreview.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      {photoPreview.map((preview, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-24 object-cover rounded-md border"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removePhoto(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {photos.length < 5 && (
                    <div>
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoChange}
                        className="hidden"
                        id="photo-upload"
                      />
                      <Label
                        htmlFor="photo-upload"
                        className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-accent transition-colors"
                      >
                        <Upload className="h-5 w-5" />
                        <span>Upload Photos ({photos.length}/5)</span>
                      </Label>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading || uploadingPhoto}
                  className="flex-1"
                >
                  {loading
                    ? uploadingPhoto
                      ? "Uploading photos..."
                      : "Creating..."
                    : "Create Request"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CreateRequest;