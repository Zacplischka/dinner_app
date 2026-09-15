import { useSearchParams } from 'react-router';
import SessionEntry from '../components/SessionEntry';

export default function CreateSessionPage() {
  const [params] = useSearchParams();
  return <SessionEntry branch={params.get('branch') === 'takeaway' ? 'takeaway' : 'eatout'} />;
}
