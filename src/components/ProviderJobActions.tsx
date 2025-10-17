import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProviderJobActionsProps {
  requestId: string;
  currentStatus: string;
  onStatusUpdate: () => void;
}

export const ProviderJobActions = ({ 
  requestId, 
  currentStatus, 
  onStatusUpdate 
}: ProviderJobActionsProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleMarkCompleted = async () => {
    setLoading(true);
    try {
      // Get request details to find resident
      const { data: request, error: fetchError } = await supabase
        .from("service_requests")
        .select("resident_id")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from("service_requests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      // Create notification for resident
      if (request?.resident_id) {
        await supabase.from("notifications").insert({
          user_id: request.resident_id,
          title: "Service Completed",
          message: "Your service request has been marked as completed",
          type: "success",
          related_request_id: requestId,
        });
      }

      toast({
        title: "Success",
        description: "Job marked as completed",
      });

      onStatusUpdate();
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update job status",
      });
    } finally {
      setLoading(false);
    }
  };

  if (currentStatus === "completed") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4" />
        <span>Completed</span>
      </div>
    );
  }

  return (
    <Button 
      onClick={handleMarkCompleted}
      disabled={loading}
      size="sm"
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating...
        </>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Mark Completed
        </>
      )}
    </Button>
  );
};
