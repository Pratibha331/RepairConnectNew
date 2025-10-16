import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AssignmentRequest {
  requestId: string;
}

// Haversine formula to calculate distance between two points in kilometers
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { requestId } = await req.json() as AssignmentRequest;
    
    console.log('Starting assignment for request:', requestId);

    // Get the service request details
    const { data: request, error: requestError } = await supabase
      .from('service_requests')
      .select('id, category_id, location_lat, location_lng, resident_id')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.error('Error fetching request:', requestError);
      throw new Error('Service request not found');
    }

    console.log('Request details:', {
      id: request.id,
      category: request.category_id,
      location: { lat: request.location_lat, lng: request.location_lng }
    });

    // Get all available providers for this category
    const { data: providerCategories, error: categoriesError } = await supabase
      .from('provider_categories')
      .select(`
        provider_profile_id,
        provider_profiles!inner (
          id,
          user_id,
          is_available,
          service_area_radius_km,
          profiles!inner (
            id,
            name,
            location_lat,
            location_lng
          )
        )
      `)
      .eq('category_id', request.category_id);

    if (categoriesError) {
      console.error('Error fetching providers:', categoriesError);
      throw new Error('Failed to fetch providers');
    }

    console.log('Found provider categories:', providerCategories?.length);

    // Filter available providers with valid locations and calculate distances
    const providersWithDistance = providerCategories
      ?.filter((pc: any) => {
        const provider = pc.provider_profiles;
        const profile = provider?.profiles;
        
        const isAvailable = provider?.is_available === true;
        const hasLocation = profile?.location_lat != null && profile?.location_lng != null;
        
        console.log('Provider check:', {
          id: provider?.id,
          name: profile?.name,
          isAvailable,
          hasLocation
        });
        
        return isAvailable && hasLocation;
      })
      .map((pc: any) => {
        const provider = pc.provider_profiles;
        const profile = provider.profiles;
        
        const distance = calculateDistance(
          request.location_lat,
          request.location_lng,
          profile.location_lat,
          profile.location_lng
        );

        console.log('Provider distance:', {
          name: profile.name,
          distance: distance.toFixed(2),
          serviceRadius: provider.service_area_radius_km
        });

        return {
          providerId: provider.id,
          providerName: profile.name,
          distance,
          serviceRadius: provider.service_area_radius_km,
        };
      })
      .filter((p: any) => p.distance <= p.serviceRadius)
      .sort((a: any, b: any) => a.distance - b.distance) || [];

    console.log('Providers within service radius:', providersWithDistance.length);

    if (providersWithDistance.length === 0) {
      console.log('No available providers found');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No available providers found in service area',
          requestId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Assign to the nearest provider
    const assignedProvider = providersWithDistance[0];
    console.log('Assigning to provider:', {
      id: assignedProvider.providerId,
      name: assignedProvider.providerName,
      distance: assignedProvider.distance.toFixed(2)
    });

    // Update the service request with the assigned provider
    const { error: updateError } = await supabase
      .from('service_requests')
      .update({
        provider_id: assignedProvider.providerId,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error updating request:', updateError);
      throw new Error('Failed to assign provider');
    }

    // Log the assignment in status history
    const { error: historyError } = await supabase
      .from('request_status_history')
      .insert({
        request_id: requestId,
        status: 'assigned',
        changed_by: request.resident_id,
        notes: `Automatically assigned to provider ${assignedProvider.providerName} (${assignedProvider.distance.toFixed(2)} km away)`,
      });

    if (historyError) {
      console.error('Error creating history entry:', historyError);
    }

    console.log('Assignment completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Provider assigned successfully',
        provider: {
          id: assignedProvider.providerId,
          name: assignedProvider.providerName,
          distance: assignedProvider.distance.toFixed(2),
        },
        requestId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Assignment error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Assignment failed',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
