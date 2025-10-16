import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench, LogOut, User as UserIcon, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ServiceRequestsList } from "@/components/ServiceRequestsList";
import { AvailabilityToggle } from "@/components/AvailabilityToggle";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadUserRole();
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
      setProfile(data);
    }
  };

  const loadUserRole = async () => {
    if (!user) return;

    // Get user type from auth metadata
    const userType = user.user_metadata?.user_type;
    if (userType) {
      setUserRole(userType);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } else {
      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <header className="border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">RepairConnect</h1>
          </div>
          <div className="flex items-center gap-4">
            {userRole === "admin" && (
              <Button variant="ghost" onClick={() => navigate("/admin")}>
                <UserIcon className="h-4 w-4 mr-2" />
                Admin
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate("/profile")}>
              <UserIcon className="h-4 w-4 mr-2" />
              Profile
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Welcome, {profile?.name || user?.email}</CardTitle>
                <CardDescription>
                  Account type: <span className="capitalize font-medium">{userRole}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {userRole === "resident" 
                    ? "Post service requests and connect with local providers."
                    : userRole === "provider"
                    ? "View and manage your assigned service jobs."
                    : "Manage users and service requests."}
                </p>
              </CardContent>
            </Card>

            {userRole === "resident" && (
              <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/create-request")}>
                <CardHeader>
                  <CardTitle>Post a Request</CardTitle>
                  <CardDescription>Need a repair or maintenance service?</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Service Request
                  </Button>
                </CardContent>
              </Card>
            )}

            {userRole === "provider" && user && (
              <AvailabilityToggle userId={user.id} />
            )}

            <Card>
              <CardHeader>
                <CardTitle>Service Categories</CardTitle>
                <CardDescription>Browse available services</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Plumbing, Electrical, Carpentry, HVAC, Painting, and more
                </p>
              </CardContent>
            </Card>
          </div>

          {user && userRole && (userRole === "resident" || userRole === "provider") && (
            <ServiceRequestsList userRole={userRole} userId={user.id} />
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
