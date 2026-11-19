import SafetyActions from './SafetyActions';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import {
  deleteOwned,
  googlePlaceUrl,
  deleteReview,
  listCommunities,
  listReviews,
  savePlace,
  saveReview,
  updateSaved,
  type City,
  type Place,
  type Review,
  type SavedPlace,
} from '../lib/data';
import { hasCoordinates } from '../lib/mapData';
import { useAuth } from '../providers/AuthProvider';
import { useMutation, useResource } from '../lib/useResource';
import { Button, Card, Copy, Field, Heading, Loading } from './ui';

export default function PlaceDetails({
  city,
  place,
  saved,
  onChanged,
}: {
  city: City;
  place: Place;
  saved?: SavedPlace;
  onChanged: () => Promise<void>;
}) {
  const userId = useAuth().session!.user.id;
  const mutation = useMutation();
  const reviews = useResource(useCallback(() => listReviews(place.id), [place.id]));
  const groups = useResource(useCallback(() => listCommunities(userId), [userId]));
  const [note, setNote] = useState(saved?.note ?? '');
  const [status, setStatus] = useState<SavedPlace['status']>(saved?.status ?? 'want_to_go');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmReview, setConfirmReview] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | undefined>();
  const [community, setCommunity] = useState('');
  const [rating, setRating] = useState('5');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  function editReview(review: Review) {
    setReviewId(review.id);
    setCommunity(review.community_id);
    setRating(String(review.rating));
    setBody(review.body);
  }
  return (
    <>
      <Heading>{place.name}</Heading>
      <Copy>{city.name}</Copy>
      {!!place.address && <Copy>{place.address}</Copy>}
      {!!place.category && <Copy>{place.category}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {!!notice && <Copy>{notice}</Copy>}
      {place.google_place_id ? (
        <Button
          title="Open in Google Maps"
          secondary
          onPress={() =>
            void mutation.run(async () => {
              await Linking.openURL(googlePlaceUrl(place.google_place_id!));
            })
          }
        />
      ) : hasCoordinates(place) ? (
        <Button
          title="Directions in OpenStreetMap"
          secondary
          onPress={() =>
            void mutation.run(async () => {
              await Linking.openURL(
                `https://www.openstreetmap.org/directions?to=${place.latitude},${place.longitude}`,
              );
            })
          }
        />
      ) : (
        <Copy>Location not set.</Copy>
      )}
      <Field
        label="Private note"
        value={note}
        onChangeText={setNote}
        maxLength={1000}
        multiline
        editable={!mutation.busy}
      />
      {saved ? (
        <>
          <Button
            title={
              status === 'visited'
                ? '✓ Visited — change to want to go'
                : 'Want to go — mark visited'
            }
            secondary
            disabled={mutation.busy}
            onPress={() => setStatus(status === 'visited' ? 'want_to_go' : 'visited')}
          />
          <Button
            title="Save note and status"
            disabled={mutation.busy}
            onPress={() =>
              void mutation.run(async () => {
                await updateSaved(saved.id, userId, note, status, saved.visited_at);
                await onChanged();
                setNotice('Saved.');
              })
            }
          />
          {confirmRemove ? (
            <>
              <Copy>Remove this bookmark? Your reviews will remain.</Copy>
              <Button
                title="Confirm removal"
                disabled={mutation.busy}
                onPress={() =>
                  void mutation.run(async () => {
                    await deleteOwned('saved_places', saved.id, userId);
                    await onChanged();
                    setConfirmRemove(false);
                  })
                }
              />
              <Button
                title="Keep place"
                secondary
                disabled={mutation.busy}
                onPress={() => setConfirmRemove(false)}
              />
            </>
          ) : (
            <Button
              title="Remove from saved places"
              secondary
              disabled={mutation.busy}
              onPress={() => setConfirmRemove(true)}
            />
          )}
        </>
      ) : (
        <Button
          title="Save place"
          disabled={mutation.busy}
          onPress={() =>
            void mutation.run(async () => {
              await savePlace(userId, city, place, note);
              await onChanged();
              setNotice('Place saved.');
            })
          }
        />
      )}
      <Heading>Community reviews</Heading>
      <Copy>Reviews are shared with the selected community. Private notes above stay private.</Copy>
      {reviews.loading && <Loading />}
      {!!reviews.error && <Copy error>{reviews.error}</Copy>}
      {reviews.data?.length === 0 && <Copy>No reviews visible to you yet.</Copy>}
      {reviews.data?.map((review) => (
        <Card key={review.id}>
          <Copy>
            {review.rating}/5 ·{' '}
            {groups.data?.find((g) => g.id === review.community_id)?.name ?? 'Community'}
            {review.user_id === userId ? ' · Your review' : ''}
          </Copy>
          <Copy>{review.body}</Copy>
          {review.user_id !== userId && (
            <SafetyActions
              kind="review"
              target={review.id}
              userId={review.user_id}
              onChanged={reviews.reload}
            />
          )}
          {review.user_id === userId && (
            <>
              <Button
                title="Edit review"
                secondary
                disabled={mutation.busy}
                onPress={() => editReview(review)}
              />
              {confirmReview === review.id ? (
                <>
                  <Copy>Delete this review permanently?</Copy>
                  <Button
                    title="Confirm delete"
                    disabled={mutation.busy}
                    onPress={() =>
                      void mutation.run(async () => {
                        await deleteReview(review.id, userId);
                        setConfirmReview(null);
                        await reviews.reload();
                      })
                    }
                  />
                  <Button title="Keep review" secondary onPress={() => setConfirmReview(null)} />
                </>
              ) : (
                <Button
                  title="Delete review"
                  secondary
                  disabled={mutation.busy}
                  onPress={() => setConfirmReview(review.id)}
                />
              )}
            </>
          )}
        </Card>
      ))}
      {reviews.data?.length === 50 && <Copy>Showing the latest 50 visible reviews.</Copy>}
      <Heading>{reviewId ? 'Edit your review' : 'Write a review'}</Heading>
      {groups.loading && <Loading />}
      {!!groups.error && <Copy error>{groups.error}</Copy>}
      {groups.data?.map((group) => (
        <Button
          key={group.id}
          title={`${community === group.id ? '✓ ' : ''}${group.name}`}
          secondary
          disabled={mutation.busy}
          onPress={() => setCommunity(group.id)}
        />
      ))}
      {groups.data?.length === 0 && <Copy>Join a community before posting a review.</Copy>}
      <Field
        label="Rating (1–5)"
        value={rating}
        onChangeText={setRating}
        keyboardType="number-pad"
        maxLength={1}
      />
      <Field
        label="Review shared with this community"
        value={body}
        onChangeText={setBody}
        maxLength={3000}
        multiline
      />
      <Button
        title={reviewId ? 'Update review' : 'Publish review'}
        disabled={mutation.busy || !groups.data?.some((g) => g.id === community) || !body.trim()}
        onPress={() =>
          void mutation.run(async () => {
            await saveReview(userId, city, place, community, Number(rating), body, reviewId);
            setBody('');
            setReviewId(undefined);
            await reviews.reload();
          })
        }
      />
      {!!reviewId && (
        <Button
          title="Cancel editing"
          secondary
          disabled={mutation.busy}
          onPress={() => {
            setReviewId(undefined);
            setBody('');
          }}
        />
      )}
    </>
  );
}
