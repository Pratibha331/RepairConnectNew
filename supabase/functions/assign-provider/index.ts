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
      .select('provider_profile_id')
      .eq('category_id', request.category_id);

    if (categoriesError) {
      console.error('Error fetching provider categories:', categoriesError);
      throw new Error('Failed to fetch providers');
    }

    if (!providerCategories || providerCategories.length === 0) {
      console.log('No providers found for this category');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No providers available for this category',
          requestId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Get provider profiles with location data
    const { data: providerProfiles, error: profilesError } = await supabase
      .from('provider_profiles')
      .select(`
        id,
        user_id,
        is_available,
        service_area_radius_km
      `)
      .in('id', providerCategories.map(pc => pc.provider_profile_id))
      .eq('is_available', true);

    if (profilesError) {
      console.error('Error fetching provider profiles:', profilesError);
      throw new Error('Failed to fetch provider profiles');
    }

    // Get user profiles with location data
    const userIds = providerProfiles?.map(pp => pp.user_id) || [];
    const { data: profiles, error: userProfilesError } = await supabase
      .from('profiles')
      .select('id, name, location_lat, location_lng')
      .in('id', userIds);

    if (userProfilesError) {
      console.error('Error fetching user profiles:', userProfilesError);
      throw new Error('Failed to fetch user profiles');
    }

    console.log('Found provider profiles:', providerProfiles?.length);
    console.log('Found user profiles:', profiles?.length);

    // Combine provider data with location data and calculate distances
    const providersWithDistance = providerProfiles
      ?.map((provider: any) => {
        const profile = profiles?.find(p => p.id === provider.user_id);
        
        if (!profile || profile.location_lat == null || profile.location_lng == null) {
          console.log('Skipping provider - no location:', {
            providerId: provider.id,
            userId: provider.user_id,
            hasProfile: !!profile
          });
          return null;
        }
        
        const distance = calculateDistance(
          request.location_lat,
          request.location_lng,
          parseFloat(profile.location_lat),
          parseFloat(profile.location_lng)
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
          serviceRadius: parseFloat(provider.service_area_radius_km),
        };
      })
      .filter((p: any) => p !== null && p.distance <= p.serviceRadius)
      .sort((a: any, b: any) => a.distance - b.distance) || [];

    console.log('Providers within service radius:', providersWithDistance.length);

    if (providersWithDistance.length === 0) {
      console.log('No available providers found');
      
      // Notify admins about failed assignment
      const { data: adminUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (adminUsers && adminUsers.length > 0) {
        const adminNotifications = adminUsers.map(admin => ({
          user_id: admin.user_id,
          title: 'Assignment Failed',
          message: `No available provider found for request ${requestId}`,
          type: 'warning',
          related_request_id: requestId,
        }));

        await supabase.from('notifications').insert(adminNotifications);
      }
      
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
    if (!assignedProvider) {
      throw new Error('No provider available after filtering');
    }
    
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

    // Note: Status history is now automatically logged by database trigger
    console.log('Request status updated to assigned, history logged by trigger');

    // Get provider user_id for notification
    const { data: providerProfile } = await supabase
      .from('provider_profiles')
      .select('user_id')
      .eq('id', assignedProvider.providerId)
      .single();

    // Create notification for resident
    await supabase.from('notifications').insert({
      user_id: request.resident_id,
      title: 'Service Request Assigned',
      message: `Your request has been assigned to ${assignedProvider.providerName}`,
      type: 'success',
      related_request_id: requestId,
    });

    // Create notification for provider
    if (providerProfile?.user_id) {
      await supabase.from('notifications').insert({
        user_id: providerProfile.user_id,
        title: 'New Job Assignment',
        message: `You have been assigned a new service request`,
        type: 'info',
        related_request_id: requestId,
      });
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
