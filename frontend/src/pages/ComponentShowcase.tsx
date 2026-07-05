import { useState } from 'react';
import { Button } from '../components/Button';
import { Tab } from '../components/Tab';
import { TabBar } from '../components/TabBar';
import { Badge } from '../components/Badge';
import { Tag } from '../components/Tag';
import { Input } from '../components/Input';
import { ListItem } from '../components/ListItem';
import styles from './ComponentShowcase.module.css';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function ComponentShowcase() {
  const [packaging, setPackaging] = useState<'carded' | 'loose'>('carded');
  const [tags, setTags] = useState(['Hot Wheels', 'Matchbox', '2016']);

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Zamak Ledger Design System</h1>

      <Section title="Button">
        <div className={styles.row}>
          <Button variant="filled">Filled</Button>
          <Button variant="tonal">Tonal</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="text">Text</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <div className={styles.row}>
          <Button variant="filled" icon="cameraAdd01">
            With icon
          </Button>
          <Button variant="filled" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Tab / TabBar">
        <TabBar>
          <Tab selected={packaging === 'carded'} onClick={() => setPackaging('carded')}>
            Carded
          </Tab>
          <Tab selected={packaging === 'loose'} onClick={() => setPackaging('loose')}>
            Loose
          </Tab>
        </TabBar>
      </Section>

      <Section title="Badge">
        <div className={styles.row}>
          <Badge variant="success">Confirmed 95%</Badge>
          <Badge variant="warning">TH</Badge>
          <Badge variant="error">No Match</Badge>
          <Badge variant="info">In collection</Badge>
          <Badge variant="ai">AI Suggested</Badge>
          <Badge variant="neutral">Neutral</Badge>
        </div>
      </Section>

      <Section title="Tag">
        <div className={styles.row}>
          {tags.map((tag) => (
            <Tag key={tag} onRemove={() => setTags((t) => t.filter((x) => x !== tag))}>
              {tag}
            </Tag>
          ))}
          <Tag selected>All</Tag>
          <Tag disabled>Disabled</Tag>
        </div>
      </Section>

      <Section title="Input">
        <div className={styles.inputGrid}>
          <Input label="Casting name" placeholder="Custom '67 Camaro" leadingIcon="search01" />
          <Input label="Search" variant="outlined" placeholder="Search your collection" leadingIcon="search01" />
          <Input label="SKU" error helperText="This field is required" placeholder="CFH06" />
          <Input label="Brand" disabled value="Hot Wheels" readOnly />
        </div>
      </Section>

      <Section title="List Item">
        <div className={styles.listContainer}>
          <ListItem
            title="Custom '67 Camaro"
            meta="Hot Wheels · Chevrolet · 2016"
            matchLabel="Confirmed 95%"
            matchVariant="success"
            showTreasureHunt
            price="$24.99"
            statusLabel="In collection"
          />
          <ListItem
            title="Radio Flyer Wagon"
            meta="Hot Wheels · 1996"
            matchLabel="No Match 0%"
            matchVariant="error"
            price="$5.00"
            statusLabel="In collection"
          />
          <ListItem
            title="Range Rover Evoque"
            meta="Matchbox · Land Rover · 2017"
            matchLabel="Confirmed 95%"
            matchVariant="success"
            price="$5.99"
            statusLabel="Listed"
          />
        </div>
      </Section>
    </div>
  );
}
