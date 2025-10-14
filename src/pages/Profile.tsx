import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Wrench } from "lucide-react";

interface ServiceCategory {
  id: string;
  name: string;
  description: string;
}

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // Profile fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  
  // Provider-specific fields
  const [serviceRadiusKm, setServiceRadiusKm] = useState("10");
  const [isAvailable, setIsAvailable] = useState(true);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [providerProfileId, setProviderProfileId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadUserRole();
      loadCategories();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error loading profile:", error);
    } else {
      setName(data.name || "");
      setPhone(data.phone || "");
      setAddress(data.address || "");
      setLocationLat(data.location_lat?.toString() || "");
      setLocationLng(data.location_lng?.toString() || "");
    }
  };

  const loadUserRole = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error("Error loading role:", error);
    } else {
      setUserRole(data?.role);
      if (data?.role === "provider") {
        loadProviderProfile();
      }
    }
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from("service_categories")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error loading categories:", error);
    } else {
      setCategories(data || []);
    }
  };

  const loadProviderProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("provider_profiles")
      .select("*, provider_categories(category_id)")
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code !== "PGRST116") {
        console.error("Error loading provider profile:", error);
      }
    } else {
      setProviderProfileId(data.id);
      setServiceRadiusKm(data.service_area_radius_km?.toString() || "10");
      setIsAvailable(data.is_available);
      setSelectedCategories(data.provider_categories?.map((pc: any) => pc.category_id) || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          name,
          phone,
          address,
          location_lat: locationLat ? parseFloat(locationLat) : null,
          location_lng: locationLng ? parseFloat(locationLng) : null,
        })
        .eq("id", user!.id);

      if (profileError) throw profileError;

      // If provider, update/create provider profile
      if (userRole === "provider") {
        if (providerProfileId) {
          // Update existing provider profile
          const { error: providerError } = await supabase
            .from("provider_profiles")
            .update({
              service_area_radius_km: parseFloat(serviceRadiusKm),
              is_available: isAvailable,
            })
            .eq("id", providerProfileId);

          if (providerError) throw providerError;

          // Update categories
          await supabase
            .from("provider_categories")
            .delete()
            .eq("provider_profile_id", providerProfileId);

          if (selectedCategories.length > 0) {
            const { error: catError } = await supabase
              .from("provider_categories")
              .insert(
                selectedCategories.map(catId => ({
                  provider_profile_id: providerProfileId,
                  category_id: catId,
                }))
              );

            if (catError) throw catError;
          }
        } else {
          // Create new provider profile
          const { data: newProfile, error: providerError } = await supabase
            .from("provider_profiles")
            .insert({
              user_id: user!.id,
              service_area_radius_km: parseFloat(serviceRadiusKm),
              is_available: isAvailable,
            })
            .select()
            .single();

          if (providerError) throw providerError;

          if (selectedCategories.length > 0 && newProfile) {
            const { error: catError } = await supabase
              .from("provider_categories")
              .insert(
                selectedCategories.map(catId => ({
                  provider_profile_id: newProfile.id,
                  category_id: catId,
                }))
              );

            if (catError) throw catError;
          }
        }
      }

      toast({
        title: "Success",
        description: "Profile updated successfully!",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <header className="border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Edit Profile</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal details and preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    placeholder="e.g., 40.7128"
                    value={locationLat}
                    onChange={(e) => setLocationLat(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng">Longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    placeholder="e.g., -74.0060"
                    value={locationLng}
                    onChange={(e) => setLocationLng(e.target.value)}
                  />
                </div>
              </div>

              {userRole === "provider" && (
                <>
                  <div className="border-t pt-4 mt-6">
                    <h3 className="font-semibold mb-4">Provider Settings</h3>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="radius">Service Area Radius (km)</Label>
                        <Input
                          id="radius"
                          type="number"
                          step="0.1"
                          value={serviceRadiusKm}
                          onChange={(e) => setServiceRadiusKm(e.target.value)}
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="available"
                          checked={isAvailable}
                          onCheckedChange={(checked) => setIsAvailable(checked as boolean)}
                        />
                        <Label htmlFor="available" className="font-normal cursor-pointer">
                          Currently available for jobs
                        </Label>
                      </div>

                      <div className="space-y-3">
                        <Label>Service Categories</Label>
                        <div className="grid gap-2">
                          {categories.map((category) => (
                            <div key={category.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={category.id}
                                checked={selectedCategories.includes(category.id)}
                                onCheckedChange={() => toggleCategory(category.id)}
                              />
                              <Label htmlFor={category.id} className="font-normal cursor-pointer">
                                {category.name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Profile;
