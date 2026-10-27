import { toast } from 'sonner';

/** Do not echo remote error bodies: they can contain connection credentials. */
export const connectionTestFeedback = {
    onSuccess: ({ data }: { data: { success: boolean } }) => {
        if (data.success === true) {
            toast.success('Connection test passed');
        } else {
            toast.error('Connection test failed', {
                description: 'Check the endpoint, credentials and provider configuration, then try again.',
            });
        }
    },
    onError: () => {
        toast.error('Connection test could not complete', {
            description: 'The request failed or timed out. Check your connection and sign-in session, then try again.',
        });
    },
};
