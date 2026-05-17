import { create } from 'zustand';

export const useStore = create((set) => ({
  // State for Wizard Data
  wizardData: {
    interests: [],
    strengths: [],
    dislikes: [],
    work_style: '',
  },
  setWizardData: (data) => set((state) => ({ 
    wizardData: { ...state.wizardData, ...data } 
  })),

  // State for CV Data
  cvText: '',
  cvSignals: null,
  cvDocumentId: null,
  
  // Individual setters to support granular updates from components
  setCVText: (text) => set({ cvText: text }),
  setCVSignals: (signals) => set({ cvSignals: signals }),

  /**
   * Action to update CV data after successful upload.
   * Maps directly to the response from /api/upload-cv
   */
  setCVData: (text, signals, documentId = null) => set({
    cvText: text, 
    cvSignals: signals,
    cvDocumentId: documentId
  }),

  // State for Recommendations
  matchResults: null,
  setMatchResults: (results) => set({ matchResults: results }),
}));
