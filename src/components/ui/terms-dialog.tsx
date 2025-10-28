import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TermsDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TermsDialog = ({ isOpen, onConfirm, onCancel }: TermsDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Terms and Conditions</DialogTitle>
          <DialogDescription>
            Please read and accept our terms and conditions to continue
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] p-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Service Provider Agreement</h3>
            
            <section className="space-y-2">
              <h4 className="font-medium">1. Services</h4>
              <p>
                As a service provider on our platform, you agree to:
                - Provide services professionally and safely
                - Maintain accurate service descriptions and pricing
                - Respond to service requests promptly
                - Complete accepted jobs in a timely manner
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-medium">2. Safety and Insurance</h4>
              <p>
                You are responsible for:
                - Maintaining appropriate insurance coverage
                - Following safety protocols and guidelines
                - Using proper safety equipment
                - Complying with local regulations
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-medium">3. Platform Rules</h4>
              <p>
                You agree to:
                - Maintain professional communication
                - Keep your availability status updated
                - Not share personal contact information
                - Use the platform's payment system
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-medium">4. Fees and Payments</h4>
              <p>
                - Platform fees will be clearly communicated
                - Payments are processed securely through our system
                - Service providers receive payments after job completion
                - All applicable taxes are your responsibility
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-medium">5. Dispute Resolution</h4>
              <p>
                - Disputes will be handled through our resolution process
                - Both parties agree to participate in good faith
                - Platform decisions are binding
                - Legal action is a last resort
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-medium">6. Account Termination</h4>
              <p>
                We reserve the right to terminate accounts for:
                - Violation of terms
                - Repeated poor service
                - Fraudulent activity
                - Platform misuse
              </p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="flex space-x-2 mt-4">
          <Button variant="ghost" onClick={onCancel}>
            Decline
          </Button>
          <Button onClick={onConfirm}>
            Accept Terms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};