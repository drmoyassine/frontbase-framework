import { z } from 'zod';

export const Schema = z.object({
    placeholder: z.string().describe('Placeholder text for the email input field'),
    email: z.string().email().describe('Email address submitted to the newsletter'),
    submitLabel: z.string().default('Subscribe').describe('Label for the submit button'),
    successMessage: z.string().describe('Message shown after a successful subscription'),
});

export type Props = z.infer<typeof Schema>;

export function NewsletterForm(props: Props): null {
    return null;
}
