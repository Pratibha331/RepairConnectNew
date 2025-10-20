import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ProviderJobActions } from "./ProviderJobActions";

interface ServiceRequest {
  id: string;
  description: string;
  status: string;
  location_address: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  photos: string[] | null;
  service_categories: {
    name: string;
  };
  provider_profiles?: {
    profiles: {
      name: string;
      phone: string | null;
    } | null;
  } | null;
}

interface ServiceRequestsListProps {
  userRole: string | null;
  userId: string;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4" />;
    case "assigned":
    case "in_progress":
      return <AlertCircle className="h-4 w-4" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4" />;
    case "cancelled":
      return <XCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "pending":
      return "secondary";
    case "assigned":
    case "in_progress":
      return "default";
    case "completed":
      return "outline";
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
};

export const ServiceRequestsList = ({ userRole, userId }: ServiceRequestsListProps) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('service-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests',
        },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, userRole]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("service_requests")
        .select(`
          *,
          service_categories!inner (name)
        `)
        .order("created_at", { ascending: false });

      // Filter based on user role
      if (userRole === "resident") {
        query = query.eq("resident_id", userId);
      } else if (userRole === "provider") {
        // Get provider profile first
        const { data: providerProfile } = await supabase
          .from("provider_profiles")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (providerProfile) {
          query = query.eq("provider_id", providerProfile.id);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Fetch provider details separately for requests that have providers
      const requestsWithProviders = await Promise.all(
        (data || []).map(async (request) => {
          if (!request.provider_id) {
            return { ...request, provider_profiles: null };
          }

          // Get provider profile and user profile
          const { data: providerProfile } = await supabase
            .from("provider_profiles")
            .select("user_id")
            .eq("id", request.provider_id)
            .single();

          if (!providerProfile) {
            return { ...request, provider_profiles: null };
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("name, phone")
            .eq("id", providerProfile.user_id)
            .single();

          return {
            ...request,
            provider_profiles: profile ? { profiles: profile } : null
          };
        })
      );
      
      setRequests(requestsWithProviders as ServiceRequest[]);
    } catch (error) {
      console.error("Error loading requests:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading requests...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {userRole === "resident" ? "Your Service Requests" : "Assigned Jobs"}
          </CardTitle>
          <CardDescription>
            {userRole === "resident"
              ? "You haven't created any service requests yet"
              : "You don't have any assigned jobs yet"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">
        {userRole === "resident" ? "Your Service Requests" : "Assigned Jobs"}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    {request.service_categories.name}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Badge variant={getStatusVariant(request.status)} className="gap-1">
                      {getStatusIcon(request.status)}
                      <span className="capitalize">{request.status.replace('_', ' ')}</span>
                    </Badge>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{request.description}</p>
              
              {request.location_address && 
               (userRole === "resident" || 
                (userRole === "provider" && request.status !== "completed" && request.status !== "cancelled")) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{request.location_address}</span>
                </div>
              )}

              {request.photos && request.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {request.photos.slice(0, 3).map((photo, index) => (
                    <img
                      key={index}
                      src={photo}
                      alt={`Request photo ${index + 1}`}
                      className="w-full h-20 object-cover rounded-md"
                    />
                  ))}
                </div>
              )}

              {request.provider_profiles?.profiles && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium">Assigned Service Provider:</p>
                  <p className="text-sm text-muted-foreground">
                    {request.provider_profiles.profiles.name}
                    {request.provider_profiles.profiles.phone && (
                      <span> • {request.provider_profiles.profiles.phone}</span>
                    )}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground pt-2 border-t">
                <p>Created: {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
                {request.assigned_at && (
                  <p>Assigned: {format(new Date(request.assigned_at), "MMM d, yyyy 'at' h:mm a")}</p>
                )}
              {request.completed_at && (
                  <p>Completed: {format(new Date(request.completed_at), "MMM d, yyyy 'at' h:mm a")}</p>
                )}
              </div>

              {userRole === "provider" && (
                <div className="pt-3 border-t">
                  <ProviderJobActions
                    requestId={request.id}
                    currentStatus={request.status}
                    onStatusUpdate={loadRequests}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ServiceRequestsList;