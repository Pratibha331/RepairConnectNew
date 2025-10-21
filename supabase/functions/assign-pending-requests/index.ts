import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
  return R * c;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { userId } = await req.json();

    if (!userId) {
      console.error('Missing userId in request');
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking pending requests for provider user: ${userId}`);

    // Get provider profile
    const { data: providerProfile, error: providerError } = await supabase
      .from('provider_profiles')
      .select('id, user_id, service_area_radius_km, is_available')
      .eq('user_id', userId)
      .single();

    if (providerError || !providerProfile) {
      console.error('Provider profile not found:', providerError);
      return new Response(
        JSON.stringify({ error: 'Provider profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!providerProfile.is_available) {
      console.log('Provider is not available, skipping assignment');
      return new Response(
        JSON.stringify({ message: 'Provider is not available' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get provider location
    const { data: providerProfileData, error: providerProfileError } = await supabase
      .from('profiles')
      .select('location_lat, location_lng')
      .eq('id', userId)
      .single();

    if (providerProfileError || !providerProfileData) {
      console.error('Provider location not found:', providerProfileError);
      return new Response(
        JSON.stringify({ error: 'Provider location not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get provider categories
    const { data: providerCategories, error: categoriesError } = await supabase
      .from('provider_categories')
      .select('category_id')
      .eq('provider_profile_id', providerProfile.id);

    if (categoriesError || !providerCategories || providerCategories.length === 0) {
      console.error('Provider categories not found:', categoriesError);
      return new Response(
        JSON.stringify({ error: 'Provider has no service categories' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const categoryIds = providerCategories.map(pc => pc.category_id);
    console.log(`Provider categories: ${categoryIds.join(', ')}`);

    // Get all pending requests that match provider's categories
    const { data: pendingRequests, error: requestsError } = await supabase
      .from('service_requests')
      .select('id, resident_id, category_id, location_lat, location_lng, description')
      .eq('status', 'pending')
      .in('category_id', categoryIds)
      .is('provider_id', null);

    if (requestsError) {
      console.error('Error fetching pending requests:', requestsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch pending requests' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log('No pending requests found for this provider');
      return new Response(
        JSON.stringify({ message: 'No pending requests found', assignedCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingRequests.length} pending requests`);

    const providerLat = parseFloat(providerProfileData.location_lat);
    const providerLng = parseFloat(providerProfileData.location_lng);
    const serviceRadius = parseFloat(providerProfile.service_area_radius_km?.toString() || '10');

    let assignedCount = 0;

    // Check each pending request and assign if within range
    for (const request of pendingRequests) {
      const requestLat = parseFloat(request.location_lat);
      const requestLng = parseFloat(request.location_lng);

      const distance = calculateDistance(providerLat, providerLng, requestLat, requestLng);
      console.log(`Request ${request.id}: distance = ${distance.toFixed(2)} km, service radius = ${serviceRadius} km`);

      if (distance <= serviceRadius) {
        // Assign this request to the provider
        const { error: assignError } = await supabase
          .from('service_requests')
          .update({
            provider_id: providerProfile.id,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
          })
          .eq('id', request.id)
          .eq('status', 'pending'); // Double-check it's still pending

        if (assignError) {
          console.error(`Failed to assign request ${request.id}:`, assignError);
          continue;
        }

        console.log(`Successfully assigned request ${request.id} to provider ${providerProfile.id}`);
        assignedCount++;

        // Send notification to resident
        await supabase.from('notifications').insert({
          user_id: request.resident_id,
          type: 'request_assigned',
          title: 'Service Provider Assigned',
          message: 'A service provider has been assigned to your request.',
          related_request_id: request.id,
        });

        // Send notification to provider
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'new_assignment',
          title: 'New Service Assignment',
          message: 'You have been assigned a new service request.',
          related_request_id: request.id,
        });
      }
    }

    console.log(`Assigned ${assignedCount} requests to provider ${providerProfile.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Assigned ${assignedCount} pending request(s)`,
        assignedCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in assign-pending-requests function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
