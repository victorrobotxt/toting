import { useRouter } from 'next/router';
import NavBar from '../../../components/NavBar';
import withAuth from '../../../components/withAuth';
import AdminElectionForm, { Election } from '../../../components/AdminElectionForm';

function CreateElectionPage() {
  const router = useRouter();
  const onCreated = (e: Election) => {
    router.push(`/admin/elections/${e.id}`);
  };

  return (
    <>
      <NavBar />
      <div style={{ padding: '1rem', maxWidth: '800px', margin: 'auto' }}>
        <h2>Create Election</h2>
        <AdminElectionForm onCreated={onCreated} />
      </div>
    </>
  );
}

export default withAuth(CreateElectionPage, ['admin']);
