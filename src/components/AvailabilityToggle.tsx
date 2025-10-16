import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AvailabilityToggleProps {
  userId: string;
}

export const AvailabilityToggle = ({ userId }: AvailabilityToggleProps) => {
  const { toast } = useToast();
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    loadAvailability();
  }, [userId]);

  const loadAvailability = async () => {
    const { data, error } = await supabase
      .from("provider_profiles")
      .select("id, is_available")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error loading availability:", error);
    } else {
      setProfileId(data.id);
      setIsAvailable(data.is_available);
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!profileId) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("provider_profiles")
        .update({ is_available: checked })
        .eq("id", profileId);

      if (error) throw error;

      setIsAvailable(checked);
      toast({
        title: checked ? "Now Available" : "Now Unavailable",
        description: checked 
          ? "You will receive new job assignments" 
          : "You won't receive new assignments",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update availability",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="availability" className="text-base font-medium">
              Availability Status
            </Label>
            <p className="text-sm text-muted-foreground">
              {isAvailable 
                ? "Currently accepting new jobs" 
                : "Not accepting new jobs"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <Switch
              id="availability"
              checked={isAvailable}
              onCheckedChange={handleToggle}
              disabled={loading}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
