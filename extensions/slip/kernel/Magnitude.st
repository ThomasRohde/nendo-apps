"Slip kernel: Magnitude and Association."!

!Magnitude methodsFor: 'comparing'!
< aMagnitude
	^self subclassResponsibility
!
> aMagnitude
	^aMagnitude < self
!
<= aMagnitude
	^(aMagnitude < self) not
!
>= aMagnitude
	^(self < aMagnitude) not
!
between: min and: max
	^self >= min and: [self <= max]
!
max: aMagnitude
	^self > aMagnitude ifTrue: [self] ifFalse: [aMagnitude]
!
min: aMagnitude
	^self < aMagnitude ifTrue: [self] ifFalse: [aMagnitude]
! !

!Association class methodsFor: 'instance creation'!
key: aKey value: aValue
	^self new key: aKey value: aValue
! !

!Association methodsFor: 'accessing'!
key
	^key
!
key: aKey
	key := aKey
!
value
	^value
!
value: aValue
	value := aValue
!
key: aKey value: aValue
	key := aKey.
	value := aValue
! !

!Association methodsFor: 'comparing'!
< anAssociation
	^key < anAssociation key
!
= anObject
	^self class == anObject class and: [key = anObject key and: [value = anObject value]]
!
hash
	^key hash
! !

!Association methodsFor: 'printing'!
printOn: aStream
	aStream print: key; nextPutAll: '->'; print: value
! !
