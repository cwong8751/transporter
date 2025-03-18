import { useEffect, useState } from "react";
import { Button, Typography, CircularProgress, List, ListItem, ListItemText, Container, Card, Box, CardContent, AppBar, Toolbar } from "@mui/material";
import './App.css';
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Logout } from "@mui/icons-material";

function App() {
    const [guideText, setGuideText] = useState("To start using Transporter, we need you to login to Spotify.");
    const [hideSpotifyButton, setHideSpotifyButton] = useState(false);
    const [spotifyAllSongs, setSpotifyAllSongs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [disableExport, setDisableExport] = useState(false);


    const generateCodeVerifier = () => {
        const array = new Uint8Array(32);
        window.crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array)) // Convert to Base64
            .replace(/\+/g, "-") // Convert "+" to "-"
            .replace(/\//g, "_") // Convert "/" to "_"
            .replace(/=+$/, ""); // Remove "=" padding
    };

    const generateCodeChallenge = async (verifier) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await window.crypto.subtle.digest("SHA-256", data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, "-") // Convert "+" to "-"
            .replace(/\//g, "_") // Convert "/" to "_"
            .replace(/=+$/, ""); // Remove "=" padding
    };

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");

        if (code && !localStorage.getItem("spotify_access_token")) {
            exchangeCodeForToken(code);
        }

        if (localStorage.getItem("spotify_access_token")) {
            setGuideText("You are now logged in with Spotify.");
            setHideSpotifyButton(true);
            //fetchAllUserSongs(); // start getting all spotify songs 

            // get spotify user profile
            fetchSpotifyProfile().then(data => {
                setUserProfile(data);
            }
            );
        } else {
            setHideSpotifyButton(false);
        }
    }, []);

    const exchangeCodeForToken = async (code) => {
        const clientId = "e5e198164ca9473187d806fe04a420ba";
        const redirectUri = import.meta.env.REACT_APP_SPOTIFY_REDIRECT_URI || "http://localhost:5173/redirect";
        const codeVerifier = localStorage.getItem("spotify_code_verifier");

        console.log("Exchanging code for token");
        console.log("spotify code verifier", codeVerifier);

        const tokenUrl = "https://accounts.spotify.com/api/token";

        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        });

        try {
            const response = await fetch(tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });

            const data = await response.json();
            console.log("Spotify Auth Response:", data);

            if (data.access_token) {
                localStorage.setItem("spotify_access_token", data.access_token);
                localStorage.removeItem("spotify_code_verifier");

                setGuideText("You are now logged in with Spotify.");
                setHideSpotifyButton(true);

                cleanUpURL();

                fetchSpotifyProfile().then(data => {
                    setUserProfile(data);
                });
            } else {
                //TODO
            }
        } catch (error) {
            console.error("Error during Spotify login:", error);
        }
    };

    const fetchSpotifyProfile = async () => {
        const token = localStorage.getItem("spotify_access_token");

        const response = await fetch("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
        });

        // handle unauthorized
        if (response.status === 401) {
            console.error("Unauthorized! Token might have expired.");
            logOut();
            return
        }

        if (!response.ok) {
            // Handle other non-2xx HTTP errors
            console.error(`HTTP error! status: ${response.status}`);
            logOut();
            return null; // or throw an error, or return a specific error object
        }

        const data = await response.json();
        //console.log("User Profile:", data);

        return data;
    };

    const handleLogin = async () => {
        const clientId = "e5e198164ca9473187d806fe04a420ba";
        const redirectUri = import.meta.env.REACT_APP_SPOTIFY_REDIRECT_URI || "http://localhost:5173/redirect";

        const scope = [
            "user-library-read",
            "playlist-read-private",
            "playlist-read-collaborative",
        ].join(" ");

        console.log("starting login");

        const codeVerifier = generateCodeVerifier();
        console.log("code verifier", codeVerifier);
        localStorage.setItem("spotify_code_verifier", codeVerifier);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        localStorage.setItem("spotify_code_verifier", codeVerifier);

        const authUrl = new URL("https://accounts.spotify.com/authorize");
        authUrl.search = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            redirect_uri: redirectUri,
            scope: scope,
            code_challenge_method: "S256",
            code_challenge: codeChallenge,
        }).toString();

        window.location.href = authUrl.toString();
    };

    const cleanUpURL = () => {
        window.history.replaceState({}, document.title, window.location.pathname);
    };

    const fetchLikedSongs = async () => {
        const token = localStorage.getItem("spotify_access_token");

        if (!token) {
            console.error("No Spotify token found!");
            return;
        }

        setProgress(0);
        setIsLoading(true);

        let allTracks = [];
        let nextUrl = "https://api.spotify.com/v1/me/tracks?limit=50"; // Fetch 50 songs per request
        let totalFetched = 0;

        while (nextUrl) {
            const response = await fetch(nextUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json();
            if (data.items) {
                allTracks = [...allTracks, ...data.items];
            }

            nextUrl = data.next; // If there are more tracks, continue to next page
            totalFetched += data.items.length;
            setProgress(totalFetched); // Update progress bar
            //console.log("progress", progress);  
        }

        setIsLoading(false);
        console.log("Liked Songs:", allTracks);
        return allTracks;
    };

    const fetchUserPlaylists = async () => {
        const token = localStorage.getItem("spotify_access_token");

        if (!token) {
            console.error("No Spotify token found!");
            return;
        }

        let allPlaylists = [];
        let nextUrl = "https://api.spotify.com/v1/me/playlists?limit=50"; // Fetch 50 playlists per request

        while (nextUrl) {
            const response = await fetch(nextUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json();
            if (data.items) {
                allPlaylists = [...allPlaylists, ...data.items];
            }

            nextUrl = data.next; // If more playlists exist, continue to next page
        }

        console.log("User Playlists:", allPlaylists);
        return allPlaylists;
    };

    const fetchPlaylistTracks = async (playlistId) => {
        const token = localStorage.getItem("spotify_access_token");

        if (!token) {
            console.error("No Spotify token found!");
            return;
        }

        let allTracks = [];
        let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

        while (nextUrl) {
            const response = await fetch(nextUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json();
            if (data.items) {
                allTracks = [...allTracks, ...data.items];
            }

            nextUrl = data.next; // Fetch next set of tracks if available
        }

        console.log(`Tracks for Playlist ${playlistId}:`, allTracks);
        return allTracks;
    };

    const fetchAllUserSongs = async () => {
        const likedSongs = await fetchLikedSongs(); // Fetch Liked Songs
        //const playlists = await fetchUserPlaylists(); // Fetch User's Playlists

        let allSongs = [...likedSongs];

        // we are fetching liked songs only rn

        // Fetch tracks from all user playlists
        // for (let playlist of playlists) {
        //     const playlistTracks = await fetchPlaylistTracks(playlist.id);
        //     allSongs = [...allSongs, ...playlistTracks];
        // }

        console.log("All User Songs:", allSongs);
        setSpotifyAllSongs(allSongs);
        //return allSongs;
    };

    const logOut = () => {
        localStorage.removeItem("spotify_access_token");
        setGuideText("To start using Transporter, we need you to login to Spotify.");
        setHideSpotifyButton(false);
        setSpotifyAllSongs([]);
        setUserProfile(null);
    }

    const handleExport = () => {
        console.log("exporting songs");

        // what we want, for now. if we modify this, remember to modify sheet db too. 

        //console.log(JSON.stringify(spotifyAllSongs, null, 2));

        var filteredSongs = spotifyAllSongs.map(song => {
            if (!song.track) return null; // Skip if track is missing

            const track = song.track;

            return {
                track_name: track.name,
                artists: track.artists.map(artist => artist.name).join(", "), // Convert array to string
                ava_markets: track.available_markets.join(", "), // Convert array to string
                duration_ms: track.duration_ms,
                explicit: track.explicit ? "Yes" : "No",
                track_href: track.external_urls?.spotify || "N/A", // Get Spotify URL or fallback
                track_spotify_id: track.id,
                track_popularity: track.popularity
            };
        }).filter(song => song !== null);

        // wrap it per sheet db format
        filteredSongs = { data: filteredSongs };

        //console.log(JSON.stringify(filteredSongs, null, 2));

        //we are using the sheet db
        fetch('https://sheetdb.io/api/v1/gwok4o6b5xf23', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(filteredSongs)
        })
            .then((response) => {
                if (!response.ok) {
                    return response.json().then((err) => {
                        setGuideText(`Error ${response.status}: ${err.message || 'Something went wrong'}`);
                        throw new Error(`Error ${response.status}: ${err.message || 'Something went wrong'}`);
                       
                    });
                }
                return response.json();
            })
            .then((data) => console.log(data));

        setDisableExport(true);
        setGuideText("Your songs are exported, thank you for using Transporter");
    }

    return (
        <Container maxWidth="sm" style={{ textAlign: "center", marginTop: "20px" }}>
            <AppBar>
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 0 }}>
                        Transporter
                    </Typography>
                </Toolbar>
            </AppBar>

            <Typography sx={{ marginTop: '50px' }} variant="h5" color="textSecondary">
                {guideText}
            </Typography>

            {!hideSpotifyButton ? (
                <Button variant="contained" color="primary" onClick={handleLogin} sx={{ mt: 2 }}>
                    Login with Spotify
                </Button>
            ) : (
                <>
                    <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'center' }}> {/* Use Box for inline layout */}
                        <Button variant="contained" onClick={fetchAllUserSongs}>
                            Get Spotify Liked Songs
                        </Button>
                        <Button variant="contained" color="secondary" onClick={logOut}>
                            Log Out
                        </Button>
                    </Box>
                </>
            )}

            {userProfile && (
                <Card sx={{ maxWidth: 345, margin: "auto", mt: 4, boxShadow: 3, borderRadius: 2 }}>
                    <CardContent>
                        <Typography gutterBottom variant="h5" component="div">
                            Spotify Profile
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {userProfile.display_name}
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            href={userProfile.external_urls.spotify}
                            target="_blank"
                            rel="noreferrer"
                            endIcon={<OpenInNewIcon />}
                            sx={{ mt: 2 }}
                        >
                            Your Profile on Spotify
                        </Button>
                    </CardContent>
                </Card>
            )}

            {isLoading && (
                <div style={{ marginTop: "20px" }}>
                    <CircularProgress />
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Fetched {Math.round(progress)} songs...
                    </Typography>
                </div>
            )}

            {spotifyAllSongs && spotifyAllSongs.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                    <Typography variant="h6">All Songs:</Typography>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}> {/* Fixed height and scroll */}
                        <List>
                            {spotifyAllSongs.map((song, index) => (
                                <ListItem key={index}>
                                    <ListItemText
                                        primary={song.track.name}
                                        secondary={
                                            <>
                                                <ul>
                                                    <li> Artists:
                                                        {song.track.artists.map(artist => artist.name).join(', ')}</li>
                                                    <li>Available markets: {song.track.available_markets}</li>
                                                    <li>Duration (ms): {song.track.duration_ms}</li>
                                                    <li>Explicit (Yes/No): {song.track.explicit}</li>
                                                    <li>Track details (spotify link): {song.track.href}</li>
                                                    <li>Spotify ID: {song.track.id}</li>
                                                    <li>Popularity: {song.track.popularity}</li>
                                                </ul>
                                            </>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </div>
                </div>
            )}
            <Button disabled={disableExport} variant="contained" color="success" sx={{ mt: 2 }} onClick={handleExport}>
                Export
            </Button>
        </Container>
    );
}

export default App;
