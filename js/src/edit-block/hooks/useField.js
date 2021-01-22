/* global gcbEditor */

/**
 * WordPress dependencies
 */
import { useDispatch, useSelect } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import {
	getBlock,
	getBlockNameWithNameSpace,
	getNewFieldNumber,
	getOtherLocation,
	getSettingsDefaults,
	setCorrectOrderForFields,
} from '../helpers';
import { getFieldsAsArray, getFieldsAsObject } from '../../common/helpers';
import { useBlock } from '../hooks';
import { DEFAULT_LOCATION } from '../constants';

/**
 * @typedef {Object} UseFieldReturn The return value of useField.
 * @property {function(string,string|null):string} addNewField Adds a new field.
 * @property {Object} controls All of the controls available.
 * @property {function(SelectedField):void} deleteField Deletes this field.
 * @property {function(SelectedField):void} duplicateField Duplicates this field.
 * @property {function(SelectedField,string):void} changeControl Changes the control of the field.
 * @property {function(SelectedField,Object):void} changeFieldSettings Changes field settings.
 * @property {function(SelectedField):Object} getField Gets the selected field.
 * @property {function(string,string|null):import('../components/editor').Field[]|null} getFieldsForLocation Gets all of the fields for a given location.
 * @property {function(number,number,string,string|null):void} reorderFields Reorders the fields for a given location.
 */

/** @typedef {import('../components/editor').SelectedField|import('../constants').NoFieldSelected} SelectedField The current field */

/**
 * Gets the field context.
 *
 * @return {UseFieldReturn} The field context and functions to change it.
 */
const useField = () => {
	// @ts-ignore
	const { controls } = gcbEditor;
	const { changeBlock } = useBlock();
	const editedPostContent = useSelect(
		( select ) => select( 'core/editor' ).getEditedPostContent(),
		[]
	);
	const { editPost } = useDispatch( 'core/editor' );

	const fullBlock = getBlock( editedPostContent );
	const blockNameWithNameSpace = getBlockNameWithNameSpace( fullBlock );
	const block = fullBlock[ blockNameWithNameSpace ] || {};

	const editBlock = ( newBlock ) => editPost( {
		content: JSON.stringify( {
			[ blockNameWithNameSpace ]: newBlock,
		} ),
	} );

	/**
	 * Adds a new field to the end of the existing fields.
	 *
	 * @param {string} location The location to add the field to.
	 * @param {string|null} parentField The parent field to add it to, if any.
	 * @return {string} The uniqueId of the new field.
	 */
	const addNewField = ( location, parentField ) => {
		let { fields = {} } = block;

		// Backwards compatibility: the old editor used to store no fields as [], not {}.
		if ( Array.isArray( fields ) ) {
			fields = {};
		}

		const hasParent = null !== parentField;
		if ( hasParent && fields[ parentField ] && ! fields[ parentField ].sub_fields ) {
			fields[ parentField ].sub_fields = {};
		}

		const currentFields = hasParent
			? fields[ parentField ].sub_fields
			: fields;
		const newFieldNumber = getNewFieldNumber( currentFields );
		const newFieldName = newFieldNumber
			? `new-field-${ newFieldNumber.toString() }`
			: 'new-field';
		const label = newFieldNumber
			? sprintf(
				// translators: %1$d: the field number
				__( 'New Field %1$d', 'genesis-custom-blocks' ),
				newFieldNumber
			)
			: __( 'New Field', 'genesis-custom-blocks' );

		const newControlName = 'text';
		const newField = {
			...getSettingsDefaults( newControlName, controls ),
			name: newFieldName,
			location,
			label,
			control: newControlName,
			type: 'string',
			order: Object.values( currentFields ).length,
		};

		if ( hasParent ) {
			newField.parent = parentField;
			fields[ parentField ].sub_fields[ newFieldName ] = newField;
		} else {
			fields[ newFieldName ] = newField;
		}

		const newBlock = { ...block, fields	};
		if ( ! newBlock.name ) {
			changeBlock( newBlock );
		} else {
			editBlock( newBlock );
		}

		return newFieldName;
	};

	/**
	 * Changes the control of a field.
	 *
	 * @param {SelectedField} fieldToChange The field to change.
	 * @param {string} newControlName The name of the control to change to.
	 */
	const changeControl = ( fieldToChange, newControlName ) => {
		const newControl = controls[ newControlName ];
		if ( ! newControl || ! fieldToChange.name ) {
			return;
		}

		const hasParent = fieldToChange.hasOwnProperty( 'parent' );
		const previousField = hasParent
			? block.fields[ fieldToChange.parent ].sub_fields[ fieldToChange.name ]
			: block.fields[ fieldToChange.name ];

		const newBlock = { ...block };
		const newField = {
			...getSettingsDefaults( newControl.name, controls ),
			name: previousField.name,
			label: previousField.label,
			location: previousField.location,
			order: previousField.order,
			control: newControl.name,
			type: newControl.type,
		};

		if ( hasParent ) {
			newField.parent = fieldToChange.parent;
			newBlock.fields[ fieldToChange.parent ].sub_fields[ fieldToChange.name ] = newField;
		} else {
			newBlock.fields[ fieldToChange.name ] = newField;
		}

		editBlock( newBlock );
	};

	/**
	 * Changes a field name (slug), and returns the fields.
	 *
	 * Each field is accessed in fields with a key of its name.
	 * So renaming a field involves changing that key
	 * and the field's name property.
	 *
	 * @param {Object} fields The fields from which to rename a field.
	 * @param {string} previousUniqueId The uniqueId of the field, as multiple fields can have the same name.
	 * @param {string} newName The new field name (slug).
	 * @return {Object} The fields with the field renamed.
	 */
	const changeFieldName = ( fields, previousUniqueId, newName ) => {
		const newFields = { ...fields };
		const newFieldNumber = getNewFieldNumber( fields, newName );
		const newFieldUniqueId = newFieldNumber ? `${ newName }-${ newFieldNumber }` : newName;
		const fieldToRename = newFields[ previousUniqueId ];

		// If this is a repeater, change the parent property of its sub_fields.
		if ( fieldToRename && fieldToRename.hasOwnProperty( 'sub_fields' ) ) {
			newFields[ previousUniqueId ].sub_fields = getFieldsAsObject(
				Object.values( newFields[ previousUniqueId ].sub_fields ).map( ( subField ) => {
					return {
						...subField,
						parent: newName,
					};
				} )
			);
		}

		newFields[ newFieldUniqueId ] = { ...fieldToRename, name: newName, uniqueId: newFieldUniqueId };
		delete newFields[ previousUniqueId ];

		return newFields;
	};

	/**
	 * Gets the fields for either the editor or inspector.
	 *
	 * @param {string} location The location, like 'editor', or 'inspector'.
	 * @param {string|null} parentField The parent field, if any.
	 * @return {import('../components/editor').Field[]|null} The fields with the given location.
	 */
	const getFieldsForLocation = ( location, parentField = null ) => {
		if ( ! block || ! block.fields ) {
			return null;
		}

		const fields = null === parentField ? block.fields : block.fields[ parentField ].sub_fields;
		if ( ! fields ) {
			return null;
		}

		return getFieldsAsArray( fields ).filter( ( field ) => {
			return location === field.location || ( ! field.location && DEFAULT_LOCATION === location );
		} );
	};

	/**
	 * Moves a field to another location, and sets the correct order properties.
	 *
	 * @param {import('../components/editor').Field[]} fields The index of the field to move.
	 * @param {SelectedField} selectedField The field should be moved.
	 * @param {string} newLocation The location to move it to, like 'editor'.
	 */
	const changeFieldLocation = ( fields, selectedField, newLocation ) => {
		const fieldToMove = fields[ selectedField.name ];
		const previousLocation = fieldToMove.location;

		const previousLocationFields = getFieldsForLocation( previousLocation );
		const fieldsWithoutMovedField = previousLocationFields.filter( ( field ) => {
			return field.name !== selectedField.name;
		} );

		const newLocationFields = getFieldsForLocation( newLocation );
		newLocationFields.push( fieldToMove );

		return getFieldsAsObject( [
			...setCorrectOrderForFields( fieldsWithoutMovedField ),
			...setCorrectOrderForFields( newLocationFields ),
		] );
	};

	/**
	 * Changes a field setting.
	 *
	 * @param {SelectedField} fieldToChange The field to change.
	 * @param {Object} newSettings The new settings of the field.
	 */
	const changeFieldSettings = ( fieldToChange, newSettings ) => {
		const newBlock = { ...block };
		if ( newSettings.hasOwnProperty( 'location' ) ) {
			newBlock.fields = changeFieldLocation(
				newBlock.fields,
				fieldToChange,
				newSettings.location
			);
		}

		const hasParent = fieldToChange.hasOwnProperty( 'parent' );
		const currentField = hasParent
			? newBlock.fields[ fieldToChange.parent ].sub_fields[ fieldToChange.uniqueId ]
			: newBlock.fields[ fieldToChange.uniqueId ];

		const newField = {
			...currentField,
			...newSettings,
		};

		if ( hasParent ) {
			newBlock.fields[ fieldToChange.parent ]
				.sub_fields[ fieldToChange.uniqueId ] = newField;
		} else {
			newBlock.fields[ fieldToChange.uniqueId ] = newField;
		}

		if ( newSettings.hasOwnProperty( 'name' ) ) {
			if ( hasParent ) {
				newBlock.fields[ fieldToChange.parent ].sub_fields = changeFieldName(
					newBlock.fields[ fieldToChange.parent ].sub_fields,
					fieldToChange.uniqueId,
					newSettings.name
				);
			} else {
				newBlock.fields = changeFieldName(
					newBlock.fields,
					fieldToChange.uniqueId,
					newSettings.name
				);
			}
		}

		editBlock( newBlock );
	};

	/**
	 * Deletes the field.
	 *
	 * @param {SelectedField} selectedField The field to delete.
	 */
	const deleteField = ( selectedField ) => {
		const newBlock = { ...block };
		if (
			selectedField.hasOwnProperty( 'parent' ) &&
			newBlock.fields[ selectedField.parent ] &&
			newBlock.fields[ selectedField.parent ].sub_fields
		) {
			delete newBlock.fields[ selectedField.parent ].sub_fields[ selectedField.name ];
		} else {
			delete newBlock.fields[ selectedField.name ];
		}

		editBlock( newBlock );
	};

	/**
	 * Gets a field, if it exists.
	 *
	 * @param {SelectedField} selectedField The field to get.
	 * @return {import('../components/editor').Field|{}} The field, or {}.
	 */
	const getField = ( selectedField ) => {
		if ( ! selectedField || ! selectedField.uniqueId || ! block.fields ) {
			return {};
		}

		const currentFields = selectedField.parent
			? block.fields[ selectedField.parent ].sub_fields
			: block.fields;

		return currentFields[ selectedField.uniqueId ];
	};

	/**
	 * Duplicates this field.
	 *
	 * @param {SelectedField} selectedField The name of the field to duplicate.
	 */
	const duplicateField = ( selectedField ) => {
		const { fields = {} } = block;
		const currentField = getField( selectedField );
		const hasParent = selectedField.hasOwnProperty( 'parent' );
		const currentFields = hasParent
			? fields[ selectedField.parent ].sub_fields
			: fields;

		const newFieldNumber = getNewFieldNumber( currentFields, selectedField.name );
		const newFieldName = `${ selectedField.name }-${ newFieldNumber.toString() }`;

		currentFields[ newFieldName ] = {
			...currentField,
			name: newFieldName,
			order: Object.values( fields ).length,
		};

		const newBlock = { ...block };
		if ( hasParent ) {
			newBlock.fields[ selectedField.parent ].sub_fields = currentFields;
		} else {
			newBlock.fields = currentFields;
		}

		editBlock( newBlock );
	};

	/**
	 * Reorders fields, moving a single field to another position.
	 *
	 * @param {number} moveFrom The index of the field to move.
	 * @param {number} moveTo The index that the field should be moved to.
	 * @param {string} currentLocation The current field's location, like 'editor'.
	 * @param {string|null} parentField The field's parent field, if any.
	 */
	const reorderFields = ( moveFrom, moveTo, currentLocation, parentField = null ) => {
		const fieldsToReorder = getFieldsForLocation( currentLocation, parentField );
		if ( ! fieldsToReorder.length ) {
			return;
		}

		const newFields = [ ...fieldsToReorder ];
		[ newFields[ moveFrom ], newFields[ moveTo ] ] = [ newFields[ moveTo ], newFields[ moveFrom ] ];

		const newBlock = { ...block };
		if ( null !== parentField ) {
			newBlock.fields[ parentField ].sub_fields = getFieldsAsObject( [
				...setCorrectOrderForFields( newFields ),
			] );
		} else {
			newBlock.fields = getFieldsAsObject( [
				...setCorrectOrderForFields( newFields ),
				...getFieldsForLocation( getOtherLocation( currentLocation ) ),
			] );
		}

		editBlock( newBlock );
	};

	return {
		addNewField,
		changeControl,
		changeFieldName,
		changeFieldSettings,
		controls,
		deleteField,
		duplicateField,
		getField,
		getFieldsForLocation,
		reorderFields,
	};
};

export default useField;
