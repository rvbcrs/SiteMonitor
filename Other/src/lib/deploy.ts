/**
 * Helper functions for deploying Supabase Edge Functions
 */
import { supabase } from './supabase';

// List of edge functions to deploy
const EDGE_FUNCTIONS = [
  { name: 'test-notification', path: 'supabase/functions/test-notification/index.ts' },
  { name: 'email-notification', path: 'supabase/functions/email-notification/index.ts' },
  { name: 'send-email', path: 'supabase/functions/send-email/index.ts' }
];

/**
 * Deploys all edge functions to Supabase
 * 
 * NOTE: This is a simulated deployment for development/testing.
 * For actual deployment, you must use the Supabase CLI.
 * See docs/deploying-edge-functions.md for instructions.
 */
export async function deployEdgeFunctions(supabaseUrl: string, supabaseKey: string) {
  try {
    console.log('Starting edge function simulation...');
    
    // Get the user's session to obtain the JWT
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('You must be logged in to deploy functions.');
    }
    
    // Use the user's JWT for authentication
    const jwt = session.access_token;
    
    // Simulate deploying each function
    const deployedFunctions = [];
    let hasError = false;

    for (const func of EDGE_FUNCTIONS) {
      try {
        console.log(`Preparing to deploy ${func.name}...`);
        
        // Get the function code
        const codeResponse = await fetch(`/${func.path}`);
        if (!codeResponse.ok) {
          throw new Error(`Failed to load function code: ${codeResponse.statusText}`);
        }
        
        const code = await codeResponse.text();
        
        // Call the deploy-functions edge function with the user's JWT
        console.log(`Simulating deployment of ${func.name}...`);
        const response = await fetch(`${supabaseUrl}/functions/v1/deploy-functions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`  // Use JWT instead of anon key
          },
          body: JSON.stringify({
            name: func.name,
            code
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage;
          
          try {
            // Try to parse as JSON for better error details
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorText;
          } catch {
            errorMessage = errorText || response.statusText;
          }
          
          throw new Error(errorMessage);
        }
        
        const result = await response.json();
        console.log(`Successfully simulated deployment of ${func.name}`);
        
        deployedFunctions.push({
          name: func.name,
          status: 'success',
          deploymentTime: result.deploymentTime || new Date().toISOString()
        });
      } catch (error: any) {
        console.error(`Error simulating deployment of ${func.name}:`, error.message);
        hasError = true;
        deployedFunctions.push({
          name: func.name,
          status: 'error',
          error: error.message
        });
      }
    }

    return {
      success: !hasError,
      message: hasError 
        ? 'Some functions simulation failed' 
        : 'All functions simulation completed successfully. Note: This is NOT an actual deployment to Supabase.',
      deployedFunctions,
      error: hasError ? 'Some function simulations failed. Check the deployment log for details.' : null,
      note: "To actually deploy these functions to Supabase, follow the instructions in docs/deploying-edge-functions.md"
    };
  } catch (error: any) {
    console.error('Error simulating function deployment:', error);
    return {
      success: false,
      message: 'Failed to simulate function deployment',
      error: error.message,
      deployedFunctions: []
    };
  }
}