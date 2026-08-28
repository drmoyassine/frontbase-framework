// Shared default props for different component types
export function getDefaultProps(componentType: string): Record<string, any> {
  console.log('[getDefaultProps] Requesting defaults for:', componentType);
  const defaults: Record<string, any> = {
    Button: { text: 'Button', variant: 'default', size: 'default' },
    Text: { text: 'Sample text content', size: 'base' },
    Heading: { text: 'Heading', level: '2' },
    Card: {
      icon: 'Zap',
      title: 'Feature Title',
      description: 'Feature description goes here.',
      iconSize: 'md',
      iconAlignment: 'center',
      textAlignment: 'center'
    },
    Input: { placeholder: 'Enter text...', type: 'text' },
    Textarea: { placeholder: 'Enter text...', rows: 3 },
    Select: { placeholder: 'Select an option', options: ['Option 1', 'Option 2', 'Option 3'] },
    Checkbox: { label: 'Checkbox' },
    Switch: { label: 'Toggle' },
    Badge: { text: 'Badge', variant: 'default' },
    Alert: { message: 'This is an alert message.' },
    Separator: {},
    Tabs: {
      tabs: [
        { label: 'Tab 1', content: 'Content for tab 1' },
        { label: 'Tab 2', content: 'Content for tab 2' }
      ]
    },
    Accordion: {
      items: [
        { title: 'Item 1', content: 'Content for item 1' },
        { title: 'Item 2', content: 'Content for item 2' }
      ]
    },
    Avatar: { src: '/placeholder.svg', alt: 'Avatar', fallback: 'U' },
    Breadcrumb: {
      items: [
        { label: 'Home', href: '/' },
        { label: 'Page', href: '/page' }
      ]
    },
    Progress: { value: 50 },
    Container: { className: 'p-6' },
    Image: { src: '/placeholder.svg', alt: 'Placeholder image', width: '200px', height: '200px' },
    Link: { text: 'Link', href: '#', target: '_self' },
    Icon: { icon: '⭐', size: 'md', color: 'currentColor' },
    DataTable: { binding: null },
    KPICard: { binding: null },
    Chart: { binding: null, chartType: 'bar' },
    Grid: { binding: null, columns: 3 },
    Repeater: { binding: null, layout: 'grid', columns: 3, children: [] },
    Embed: { embedType: 'iframe', width: '100%', height: '400px', title: 'Embedded content', sandbox: 'allow-scripts allow-same-origin allow-forms', loading: 'lazy' },
    Pricing: {
      title: 'Simple, transparent pricing',
      subtitle: 'No hidden fees. Cancel anytime.',
      source: 'manual', // 'manual' | 'frontbase_plans'
      plans: [
        {
          name: 'Starter',
          price: 'Free',
          period: '',
          description: 'Basic features for personal use',
          features: ['1 User', 'Basic Analytics', 'Standard Support'],
          ctaText: 'Get Started',
          ctaLink: '#',
          highlighted: false
        },
        {
          name: 'Pro',
          price: '$29',
          period: '/month',
          description: 'Advanced features for scaling teams',
          features: ['5 Users', 'Advanced Analytics', 'Priority Support', 'Custom Integration'],
          ctaText: 'Start Trial',
          ctaLink: '#',
          highlighted: true,
          badge: 'Most Popular'
        },
        {
          name: 'Enterprise',
          price: 'Custom',
          period: '',
          description: 'Bespoke solutions for large operations',
          features: ['Unlimited Users', 'Dedicated Environment', '24/7 Support', 'Custom Agreements'],
          ctaText: 'Contact Sales',
          ctaLink: '#',
          highlighted: false
        }
      ]
    }
  };

  return defaults[componentType] || {};
}