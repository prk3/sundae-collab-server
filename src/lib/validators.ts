import * as yup from 'yup';
import jot from 'jot';
import { ServerMessages, ClientMessages, JsonData } from 'sundae-collab-shared';

// TODO remove when yup types get updated
import '../declarations';

/**
 * Object containing a data validator for each type of server request.
 */
export const serverInputValidators: {
  [key in keyof ServerMessages]: yup.Schema<Parameters<ServerMessages[key]>[0]>
} = {
  AUTHENTICATE: yup.object().required().shape({
    clientIdentity: yup.mixed<JsonData>().defined(),
  }),

  JOIN_SESSION: yup.object().required().shape({
    resourceType: yup.string().defined().matches(/^\w+$/),
    resourceId: yup.string().defined().matches(/^\w+$/),
  }),

  START_SESSION: yup.object().required().shape({
    resourceType: yup.string().defined().matches(/^\w+$/),
    resourceId: yup.string().defined().matches(/^\w+$/),
    resourceValue: yup.mixed<jot.Document>().defined(),
  }),

  LEAVE_SESSION: yup.object().required().shape({
    sessionId: yup.string().required(),
  }),

  UPDATE_RESOURCE: yup.object().required().shape({
    sessionId: yup.string().required(),
    update: yup.object().required().shape({
      base: yup.number().required().min(0),
      operation: yup.mixed<jot.OpJson>().defined(),
    }),
  }),
};

/**
 * Object containing a response validator for each type of client request.
 */
export const clientOutputValidators: {
  [key in keyof ClientMessages]: yup.Schema<ReturnType<ClientMessages[key]>>
} = {
  ADD_PARTICIPANT: yup.object().required().shape({}),
  REMOVE_PARTICIPANT: yup.object().required().shape({}),
  UPDATE_RESOURCE: yup.object().required().shape({}),
};
