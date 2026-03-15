import { useQuery } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/queryClient";

export function useAuth() {
  const token = getAuthToken();
  
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !!token, // Only fetch if token exists
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!token,
  };
}

// Helper function to store auth token
export function setAuthToken(token: string) {
  localStorage.setItem('auth_token', token);
}

// Helper function to remove auth token
export function removeAuthToken() {
  localStorage.removeItem('auth_token');
}
