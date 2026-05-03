import { useCallback, useEffect, useState } from 'react';
import {
  getFacultyProofOfCompliance,
  submitFacultyProofOfCompliance,
} from '../services/proofComplianceApi';

export const useProofOfCompliance = (tripId) => {
  const [proof, setProof] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadProof = useCallback(async ({ silent = false } = {}) => {
    if (!tripId) {
      setProof(null);
      return null;
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      const data = await getFacultyProofOfCompliance(tripId);
      setProof(data || null);
      setError('');
      return data || null;
    } catch (loadError) {
      setError(loadError.message || 'Failed to load proof of compliance.');
      setProof(null);
      return null;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [tripId]);

  useEffect(() => {
    loadProof();
  }, [loadProof]);

  const submitProof = useCallback(async (payload) => {
    if (!tripId) {
      throw new Error('Trip is missing.');
    }

    setSubmitting(true);
    setError('');

    try {
      const data = await submitFacultyProofOfCompliance(tripId, payload);
      setProof(data?.proof || null);
      return data;
    } catch (submitError) {
      const message = submitError.message || 'Failed to submit proof of compliance.';
      setError(message);
      throw submitError;
    } finally {
      setSubmitting(false);
    }
  }, [tripId]);

  return {
    proof,
    loading,
    submitting,
    error,
    loadProof,
    submitProof,
    clearProofError: () => setError(''),
  };
};
